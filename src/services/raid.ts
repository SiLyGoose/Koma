import type { RaidBossId } from '../constants/index.js';
import { collections } from '../db.js';
import type { CrateShare } from '../lib/events/crate.js';
import type { RaidStats } from '../lib/events/raid.js';
import type { RaidWeek } from '../lib/events/raid-week.js';
import type { RaidDoc } from '../types.js';
import { ensureMember, giveGems, giveTokens } from './economy/index.js';
import { isDuplicateKey, recordLedger } from './economy/shared.js';
import { payShares } from './events.js';
import { addVaultLoss } from './vault.js';

/*
 * The database side of the weekly raid (commands/raid.ts). The week's raid document is what makes
 * it one raid per server per week: it is inserted when the raid starts, and its id can only exist
 * once. While the raid is played, the document also keeps count of every point that moved because
 * of it (boosts bought, points the boss stole), so a raid the bot never finished can hand them back
 * (see abandonRaid). When a raid ends, all of those points go into the vault pool (see finishRaid).
 * Points only move through single conditional updates, like everywhere else.
 */

const ACTIVE: RaidDoc['status'][] = ['preparing', 'fighting'];

export const raidId = (guildId: string, weekKey: string): string => `${guildId}:${weekKey}`;

export type StartRaidResult = { ok: true; id: string } | { ok: false; existing: RaidDoc | null };

/** Claims this week's raid (against `boss`) for the server. Fails (with the raid already there) if one was started this week. */
export async function startRaidWeek(guildId: string, week: RaidWeek, boss: RaidBossId, startedBy: string): Promise<StartRaidResult> {
  const id = raidId(guildId, week.key);
  try {
    await collections().raids.insertOne({
      _id: id,
      guildId,
      weekKey: week.key,
      boss,
      startedBy,
      status: 'preparing',
      channelId: null,
      messageId: null,
      players: [],
      spent: {},
      stolen: {},
      createdAt: new Date(),
    });
    return { ok: true, id };
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
    return { ok: false, existing: await collections().raids.findOne({ _id: id }) };
  }
}

/** Saves where the raid's message is, who is in it, or that the fight has started. */
export async function updateRaid(id: string, set: Partial<Pick<RaidDoc, 'status' | 'channelId' | 'messageId' | 'players'>>): Promise<void> {
  await collections().raids.updateOne({ _id: id }, { $set: set });
}

export type BoostResult = { ok: true; balance: number } | { ok: false; balance: number };

/** Takes `cost` points from the player for a boost, if they have that many. The raid records it. */
export async function payForBoost(guildId: string, userId: string, id: string, cost: number): Promise<BoostResult> {
  const { members, raids } = collections();
  await ensureMember(guildId, userId);
  const after = await members.findOneAndUpdate({ guildId, userId, points: { $gte: cost } }, { $inc: { points: -cost } }, { returnDocument: 'after' });
  if (!after) {
    const current = await members.findOne({ guildId, userId });
    return { ok: false, balance: current?.points ?? 0 };
  }
  await raids.updateOne({ _id: id }, { $inc: { [`spent.${userId}`]: cost } });
  await recordLedger([{ guildId, userId, delta: -cost, reason: 'raid_boost' }]);
  return { ok: true, balance: after.points };
}

/** Gives back a boost that was paid for but couldn't be used (the turn ended while it was being paid). */
export async function refundBoost(guildId: string, userId: string, id: string, cost: number): Promise<void> {
  const { members, raids } = collections();
  await members.updateOne({ guildId, userId }, { $inc: { points: cost } });
  await raids.updateOne({ _id: id }, { $inc: { [`spent.${userId}`]: -cost } });
  await recordLedger([{ guildId, userId, delta: cost, reason: 'raid_refund' }]);
}

/** The boss's Hoard: takes up to `wanted` points from the player's wallet (never their vault). Returns what it took. */
export async function stealFromWallet(guildId: string, userId: string, id: string, wanted: number): Promise<number> {
  const { members, raids } = collections();
  const before = await members.findOneAndUpdate(
    { guildId, userId },
    [{ $set: { points: { $subtract: ['$points', { $min: ['$points', wanted] }] } } }],
    { returnDocument: 'before' },
  );
  const taken = Math.min(wanted, before?.points ?? 0);
  if (taken <= 0) return 0;
  await raids.updateOne({ _id: id }, { $inc: { [`stolen.${userId}`]: taken } });
  await recordLedger([{ guildId, userId, delta: -taken, reason: 'raid_stolen' }]);
  return taken;
}

/** What a raid took out of players' wallets: every boost bought and everything the boss stole. */
export const raidTakings = (raid: Pick<RaidDoc, 'spent' | 'stolen'>): number =>
  [raid.spent, raid.stolen].reduce((sum, bucket) => sum + Object.values(bucket ?? {}).reduce((a, b) => a + Math.max(0, b), 0), 0);

/**
 * Records how the raid ended. From here on it is history, and abandonRaid leaves it alone. The
 * points it took (boosts and thefts) go into the vault pool, once: only the call that moves the raid
 * out of play does it. Returns how many went in.
 */
export async function finishRaid(
  id: string,
  status: 'won' | 'wiped' | 'fled',
  summary: { damage: Record<string, number>; stats: Record<string, RaidStats>; lastHit: string | null; rounds: number },
): Promise<number> {
  const raid = await collections().raids.findOneAndUpdate(
    { _id: id, status: { $in: ACTIVE } },
    { $set: { status, ...summary, endedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!raid) return 0;
  const takings = raidTakings(raid);
  if (takings > 0) await addVaultLoss(raid.guildId, takings);
  return takings;
}

export interface RaidReward {
  /** Who could not be paid their points, komaTokens or komaGems (logged). Everyone else got all of it. */
  failed: string[];
}

/** Pays everyone who took part `reward` points, `tokens` komaTokens and `gems` komaGems. */
export async function rewardRaid(guildId: string, userIds: readonly string[], reward: number, tokens: number, gems: number): Promise<RaidReward> {
  const shares: CrateShare[] = userIds.map((userId) => ({ userId, amount: reward }));
  const payout = await payShares(guildId, shares, 'raid_reward');
  const failed = new Set(payout.failed);
  if (tokens > 0) {
    for (const userId of userIds) {
      try {
        await giveTokens(guildId, userId, tokens, 'raid_tokens');
      } catch (err) {
        console.error(`Could not give ${userId} their ${tokens} raid komaTokens in ${guildId}:`, err);
        failed.add(userId);
      }
    }
  }
  if (gems > 0) {
    for (const userId of userIds) {
      try {
        await giveGems(guildId, userId, gems, 'raid_gems');
      } catch (err) {
        console.error(`Could not give ${userId} their ${gems} raid komaGems in ${guildId}:`, err);
        failed.add(userId);
      }
    }
  }
  return { failed: [...failed] };
}

/**
 * Calls off a raid that never finished: gives every player back what they spent on boosts and what
 * the boss stole, and removes the raid so the server can start this week's raid again. Only one
 * caller can take the raid, so it is never refunded twice. Returns it, or null if it had already
 * finished or been called off.
 */
export async function abandonRaid(id: string): Promise<RaidDoc | null> {
  const raid = await collections().raids.findOneAndDelete({ _id: id, status: { $in: ACTIVE } });
  if (!raid) return null;
  const owed = new Map<string, number>();
  for (const bucket of [raid.spent, raid.stolen]) {
    for (const [userId, amount] of Object.entries(bucket ?? {})) owed.set(userId, (owed.get(userId) ?? 0) + amount);
  }
  const shares = [...owed].filter(([, amount]) => amount > 0).map(([userId, amount]) => ({ userId, amount }));
  const payout = await payShares(raid.guildId, shares, 'raid_refund');
  if (payout.failed.length > 0) console.error(`Could not refund raid ${id} to: ${payout.failed.join(', ')}`);
  return raid;
}

/** Raids that were still being played when the bot last stopped. */
export async function listUnfinishedRaids(): Promise<RaidDoc[]> {
  return collections().raids.find({ status: { $in: ACTIVE } }).toArray();
}

/** Admin only: forgets this week's finished raid so the server can raid again. False if there was none (or it is still going). */
export async function resetRaidWeek(guildId: string, weekKey: string): Promise<boolean> {
  const result = await collections().raids.deleteOne({ _id: raidId(guildId, weekKey), status: { $nin: ACTIVE } });
  return result.deletedCount > 0;
}

/** How many points a member has in their wallet right now. */
export async function walletOf(guildId: string, userId: string): Promise<number> {
  const member = await collections().members.findOne({ guildId, userId }, { projection: { points: 1 } });
  return member?.points ?? 0;
}
