import type { RaidDoc } from '../types.js';

/*
 * What the weekly newsletter (src/newsletter) says about a week, worked out from what the bot kept:
 * the week's robs (ledger entries) and its raid (the raid document). Nothing here reads the database.
 */

/** A ledger entry, as much of it as the rob summary needs. */
export interface RobEntry {
  userId: string;
  otherUserId?: string;
  delta: number;
  reason: string;
  createdAt: Date;
}

/** Someone at the top of a rob list: how much, over how many robs. */
export interface RobLeader {
  userId: string;
  amount: number;
  count: number;
}

export interface RobSummary {
  /** Every rob that got an answer: got away, slipped or caught. */
  attempts: number;
  /** Got away with it (and didn't slip). */
  gotAway: number;
  /** Got away, then slipped and handed it all back (Piplup). */
  slipped: number;
  /** Caught, and paid a fine. */
  caught: number;
  /** The most taken in one rob that stuck. */
  biggest: { robber: string; victim: string; amount: number } | null;
  /** Who took the most, all told, in robs that stuck. */
  topRobber: RobLeader | null;
  /** Who lost the most, all told, to robs that stuck. */
  mostRobbed: RobLeader | null;
}

/** One rob, as its ledger entries are written together (services/economy/rob.ts): robber, victim and the moment. */
const robKey = (robber: string, victim: string | undefined, at: Date): string => `${robber}|${victim ?? ''}|${at.getTime()}`;

/** The leader of `totals`: the most, and the earliest to get there on a tie (Map keeps the order they came in). */
function leader(totals: Map<string, { amount: number; count: number }>): RobLeader | null {
  let best: RobLeader | null = null;
  for (const [userId, { amount, count }] of totals) {
    if (amount > 0 && (best === null || amount > best.amount)) best = { userId, amount, count };
  }
  return best;
}

/**
 * The week's robs, from its 'rob_won', 'rob_slip_paid' and 'rob_fine_paid' ledger entries (any others
 * are left out). A rob that slipped is written in the same batch as its 'rob_won' (the same robber,
 * victim and moment), which is how it is told apart: it doesn't count as getting away, or towards
 * anyone's totals. A rob caught without a fine to pay leaves no entry, so it isn't counted.
 */
export function summarizeRobs(entries: readonly RobEntry[]): RobSummary {
  const sorted = [...entries].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const slips = new Set(sorted.filter((e) => e.reason === 'rob_slip_paid').map((e) => robKey(e.userId, e.otherUserId, e.createdAt)));
  const robbers = new Map<string, { amount: number; count: number }>();
  const victims = new Map<string, { amount: number; count: number }>();
  const add = (totals: typeof robbers, userId: string, amount: number): void => {
    const now = totals.get(userId) ?? { amount: 0, count: 0 };
    totals.set(userId, { amount: now.amount + amount, count: now.count + 1 });
  };

  let won = 0;
  let slipped = 0;
  let caught = 0;
  let biggest: RobSummary['biggest'] = null;
  for (const entry of sorted) {
    if (entry.reason === 'rob_fine_paid') caught++;
    if (entry.reason !== 'rob_won') continue;
    won++;
    if (slips.has(robKey(entry.userId, entry.otherUserId, entry.createdAt))) {
      slipped++;
      continue;
    }
    add(robbers, entry.userId, entry.delta);
    if (entry.otherUserId) add(victims, entry.otherUserId, entry.delta);
    if (biggest === null || entry.delta > biggest.amount) biggest = { robber: entry.userId, victim: entry.otherUserId ?? '', amount: entry.delta };
  }
  return {
    attempts: won + caught,
    gotAway: won - slipped,
    slipped,
    caught,
    biggest,
    topRobber: leader(robbers),
    mostRobbed: leader(victims),
  };
}

/** The raider at the top of one of the raid's stats, and how much (null when nobody did any). */
export interface RaidLeader {
  userId: string;
  amount: number;
}

export interface RaidSummary {
  status: RaidDoc['status'];
  boss: NonNullable<RaidDoc['boss']>;
  raiders: number;
  rounds: number;
  topDamage: RaidLeader | null;
  topHealer: RaidLeader | null;
  topGuard: RaidLeader | null;
  lastHit: string | null;
}

/** The raider with the most of `pick` (the first in the party on a tie), or null when nobody has any. */
function raidLeader(raid: RaidDoc, pick: (userId: string) => number): RaidLeader | null {
  let best: RaidLeader | null = null;
  for (const userId of raid.players) {
    const amount = pick(userId);
    if (amount > 0 && (best === null || amount > best.amount)) best = { userId, amount };
  }
  return best;
}

/**
 * How a raid went, for the newsletter. Null while it is still being played (or never got past its
 * lobby). Raids from before every stat was kept fall back to their damage alone.
 */
export function summarizeRaid(raid: RaidDoc | null): RaidSummary | null {
  if (!raid || raid.status === 'preparing' || raid.status === 'fighting') return null;
  const stat = (userId: string) => raid.stats?.[userId];
  return {
    status: raid.status,
    boss: raid.boss ?? 'wyrm',
    raiders: raid.players.length,
    rounds: raid.rounds ?? 0,
    topDamage: raidLeader(raid, (id) => stat(id)?.damage ?? raid.damage?.[id] ?? 0),
    topHealer: raidLeader(raid, (id) => stat(id)?.healed ?? 0),
    topGuard: raidLeader(raid, (id) => stat(id)?.mitigated ?? 0),
    lastHit: raid.lastHit ?? null,
  };
}
