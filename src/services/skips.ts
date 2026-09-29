import type { Filter } from 'mongodb';
import { CONFIG } from '../config.js';
import { collections } from '../db.js';
import { dayKey, raidWeek } from '../lib/events/raid-week.js';
import { skipPrice, skipsUsedOn } from '../lib/game/skips.js';
import { currentHour, nextHourUnix } from '../lib/time.js';
import type { LedgerReason, MemberDoc, RaidDoc, SkipId } from '../types.js';
import { claimReadyHour } from './economy/claim.js';
import { ensureMember, recordLedger } from './economy/shared.js';
import { extraRaidId, raidId } from './raid.js';

/*
 * Paying points to skip a cooldown. Every skip is one entry in SKIPS, which says what it costs the
 * member right now and whether there is a wait to skip (its quote); the skip command then carries
 * it out. The points paid are burned: they go nowhere.
 *
 * Two kinds so far:
 * - A member's own cooldown (the claim): the wait is on their member document, so taking the price,
 *   ending the wait and counting the skip is one conditional update (skipMemberCooldown). The first
 *   skip each day costs the base price, and each one after it that day double the one before.
 *   Another one is a MemberSkip entry, a SkipId, a ledger reason and a skip.<id> setting.
 * - The server's weekly raid: a flat price, once per server per week, and paying starts the extra
 *   raid (commands/raid.ts runExtraRaid, with chargeForSkip / refundSkip below).
 */

export interface SkipQuote {
  /** What skipping costs the member right now. */
  price: number;
  /** When the wait ends (unix seconds), or null if there's no wait to skip right now. */
  waitingUntil: number | null;
  /** It has already been skipped as many times as allowed (until the wait is over). */
  usedUp: boolean;
}

export interface CooldownSkip {
  id: SkipId;
  quote(guildId: string, userId: string, now: number): Promise<SkipQuote>;
}

/** A cooldown kept on the member's own document, skipped with skipMemberCooldown. */
export interface MemberSkip extends CooldownSkip {
  /** Its base price: what the first skip of the day costs. */
  baseCost(): number;
  /** When the member's wait ends (unix seconds), or null if they aren't waiting on it. */
  waitingUntil(member: MemberDoc, now: number): number | null;
  /**
   * What ends the wait: `filter` only matches while the cooldown is still what was read from
   * `member` (so two skips at once can't both pay), and `set` is the fields to change.
   */
  clear(member: MemberDoc, now: number): { filter: Filter<MemberDoc>; set: Partial<MemberDoc> };
  reason: LedgerReason;
}

/** A MemberSkip from its parts, with the shared quote: the doubling price and the member's wait. */
function memberSkip(parts: Omit<MemberSkip, 'quote'>): MemberSkip {
  const skip: MemberSkip = {
    ...parts,
    quote: async (guildId, userId, now) => {
      const member = await collections().members.findOne({ guildId, userId });
      return {
        price: skipPrice(skip.baseCost(), skipsUsedOn(member?.skips?.[skip.id], dayKey(new Date(now)))),
        waitingUntil: member ? skip.waitingUntil(member, now) : null,
        usedUp: false,
      };
    },
  };
  return skip;
}

export const claimSkip = memberSkip({
  id: 'claim',
  baseCost: () => CONFIG.skip.claim,
  waitingUntil: (member, now) => {
    const hour = currentHour(now);
    const readyHour = claimReadyHour(member);
    return readyHour <= hour ? null : nextHourUnix(readyHour - 1);
  },
  // The claim is ready once lastClaimHour is at least one hour back with a gap of 1. Moving it back
  // only as far as last hour means STONKS! sees a one-hour wait, not the time before the last claim.
  clear: (member, now) => ({
    filter: { lastClaimHour: member.lastClaimHour, claimGapHours: member.claimGapHours ?? null },
    set: { lastClaimHour: Math.min(member.lastClaimHour, currentHour(now) - 1), claimGapHours: 1 },
  }),
  reason: 'skip_claim',
});

const isFinished = (raid: RaidDoc | null): boolean => raid !== null && (raid.status === 'won' || raid.status === 'wiped' || raid.status === 'fled');

/** This week's raid and its extra raid (bought with a skip), either missing if there is none. */
export async function raidWeekDocs(guildId: string, weekKey: string): Promise<{ main: RaidDoc | null; extra: RaidDoc | null }> {
  const { raids } = collections();
  const [main, extra] = await Promise.all([raids.findOne({ _id: raidId(guildId, weekKey) }), raids.findOne({ _id: extraRaidId(guildId, weekKey) })]);
  return { main, extra };
}

/**
 * The weekly raid: once this week's raid has been fought, one extra raid (against another boss) can
 * be bought for a flat price, once per week.
 */
export const raidSkip: CooldownSkip = {
  id: 'raid',
  quote: async (guildId, _userId, now) => {
    const week = raidWeek(new Date(now));
    const { main, extra } = await raidWeekDocs(guildId, week.key);
    return {
      price: CONFIG.skip.raid,
      waitingUntil: isFinished(main) && !extra ? Math.floor(week.next.getTime() / 1000) : null,
      usedUp: extra !== null,
    };
  },
};

/** Everything that can be skipped, in the order the skip command lists them. */
export const SKIPS: readonly CooldownSkip[] = [claimSkip, raidSkip];

export const findSkip = (id: string): CooldownSkip | undefined => SKIPS.find((skip) => skip.id === id.toLowerCase());

/** What each skip costs the member right now, and whether there's a wait to skip. */
export async function getSkipQuotes(guildId: string, userId: string, now: number = Date.now()): Promise<{ skip: CooldownSkip; quote: SkipQuote }[]> {
  return Promise.all(SKIPS.map(async (skip) => ({ skip, quote: await skip.quote(guildId, userId, now) })));
}

export type SkipResult =
  | { ok: true; paid: number; balance: number; nextPrice: number }
  | { ok: false; reason: 'not_waiting' | 'busy' }
  | { ok: false; reason: 'too_poor'; price: number; balance: number };

/**
 * Pays to end the member's wait on `skip`: one conditional update that takes the price, ends the
 * wait and counts the skip, and only goes through if they can pay and nothing changed since it was
 * read (tried again if something did).
 */
export async function skipMemberCooldown(guildId: string, userId: string, skip: MemberSkip, now: number = Date.now()): Promise<SkipResult> {
  await ensureMember(guildId, userId);
  const { members } = collections();
  const day = dayKey(new Date(now));

  for (let attempt = 0; attempt < 3; attempt++) {
    const member = await members.findOne({ guildId, userId });
    if (!member || skip.waitingUntil(member, now) === null) return { ok: false, reason: 'not_waiting' };

    const use = member.skips?.[skip.id] ?? null;
    const used = skipsUsedOn(use, day);
    const price = skipPrice(skip.baseCost(), used);
    if (member.points < price) return { ok: false, reason: 'too_poor', price, balance: member.points };

    const { filter, set } = skip.clear(member, now);
    const updated = await members.findOneAndUpdate(
      {
        guildId,
        userId,
        points: { $gte: price },
        ...filter,
        // The skips used today are as read, so the price is still right.
        ...(use ? { [`skips.${skip.id}.day`]: use.day, [`skips.${skip.id}.count`]: use.count } : { [`skips.${skip.id}`]: null }),
      },
      { $inc: { points: -price }, $set: { ...set, [`skips.${skip.id}`]: { day, count: used + 1 } } },
      { returnDocument: 'after' },
    );
    if (!updated) continue;

    if (price > 0) await recordLedger([{ guildId, userId, delta: -price, reason: skip.reason }]);
    return { ok: true, paid: price, balance: updated.points, nextPrice: skipPrice(skip.baseCost(), used + 1) };
  }
  // Something kept changing under us (another skip or claim at the same moment). Nothing was taken.
  return { ok: false, reason: 'busy' };
}

export type ChargeResult = { ok: true; balance: number } | { ok: false; balance: number };

/**
 * For a skip whose wait isn't on the member's document: takes `price` in one conditional update
 * (only if they have it). The caller then ends the wait, and gives it back with refundSkip if it can't.
 */
export async function chargeForSkip(guildId: string, userId: string, price: number, reason: LedgerReason): Promise<ChargeResult> {
  await ensureMember(guildId, userId);
  const { members } = collections();
  const after = await members.findOneAndUpdate({ guildId, userId, points: { $gte: price } }, { $inc: { points: -price } }, { returnDocument: 'after' });
  if (!after) return { ok: false, balance: (await members.findOne({ guildId, userId }))?.points ?? 0 };
  if (price > 0) await recordLedger([{ guildId, userId, delta: -price, reason }]);
  return { ok: true, balance: after.points };
}

/** Gives back a chargeForSkip whose skip couldn't go ahead. */
export async function refundSkip(guildId: string, userId: string, price: number, reason: LedgerReason): Promise<void> {
  if (price <= 0) return;
  await collections().members.updateOne({ guildId, userId }, { $inc: { points: price } });
  await recordLedger([{ guildId, userId, delta: price, reason }]);
}
