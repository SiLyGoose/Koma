import { RAID_DIFFICULTY, type RaidBossId } from '../constants/index.js';
import { collections } from '../db.js';
import type { CrateShare } from '../lib/events/crate.js';
import { rollRaidDrops, type DropCounts, type RaidDrop } from '../lib/game/items/raid-drops.js';
import type { RaidStats } from '../lib/events/raid.js';
import type { RaidWeek } from '../lib/events/raid-week.js';
import type { RaidDoc } from '../types.js';
import type { EssenceId } from '../data/transcend.js';
import { addCopy, ensureMember, giveGems, giveTokens } from './economy/index.js';
import { giveEssences } from './economy/essences.js';
import { recordLedger } from './economy/shared.js';
import { payShares } from './events.js';
import { addVaultLoss } from './vault.js';

/*
 * The database side of the raid (commands/raid.ts). Each raid has its own document, inserted when it
 * starts: a server can raid as often as it likes, one at a time (commands/raid.ts holds the server
 * while one is going). While the raid is played, the document also keeps count of every point that
 * moved because of it (points the boss stole, and boosts bought back when raids had them), so a raid
 * the bot never finished can hand them back (see abandonRaid). When a raid ends, all of those points
 * go into the vault pool (see finishRaid). Points only move through single conditional updates, like
 * everywhere else.
 */

const ACTIVE: RaidDoc['status'][] = ['preparing', 'fighting'];

/** A new raid's id: the server's, the raid week's and when it started (ms, in base 36). */
export const newRaidId = (guildId: string, weekKey: string, now: Date = new Date()): string => `${guildId}:${weekKey}:${now.getTime().toString(36)}`;

/** The server's latest raid in the raid week `weekKey` (going on or over), or null when it hasn't raided that week. */
export const latestRaid = (guildId: string, weekKey: string): Promise<RaidDoc | null> =>
  collections().raids.findOne({ guildId, weekKey }, { sort: { createdAt: -1 } });

/** Starts a raid (against `boss`) for the server, in its lobby. Returns its id. */
export async function startRaid(guildId: string, week: RaidWeek, boss: RaidBossId, startedBy: string): Promise<string> {
  const now = new Date();
  const id = newRaidId(guildId, week.key, now);
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
    createdAt: now,
  });
  return id;
}

/** Saves where the raid's message is, who is in it, or that the fight has started (and at what difficulty). */
export async function updateRaid(id: string, set: Partial<Pick<RaidDoc, 'status' | 'channelId' | 'messageId' | 'players' | 'difficulty'>>): Promise<void> {
  await collections().raids.updateOne({ _id: id }, { $set: set });
}

/** Saves each raider's gear as the fight started (see RaidDoc.gear). */
export async function saveRaidGear(id: string, gear: Record<string, unknown>): Promise<void> {
  await collections().raids.updateOne({ _id: id }, { $set: { gear } });
}

/**
 * The hardest difficulty a server can pick: one level past the hardest it has beaten (so level 1 until
 * its first win), up to RAID_DIFFICULTY.max. A server that won raids before there were levels has beaten level 1.
 */
export async function maxRaidDifficulty(guildId: string): Promise<number> {
  const { guilds, raids } = collections();
  const doc = await guilds.findOne({ _id: guildId }, { projection: { raidDifficulty: 1 } });
  const beaten = doc?.raidDifficulty ?? ((await raids.findOne({ guildId, status: 'won', tested: { $ne: true } }, { projection: { _id: 1 } })) ? 1 : 0);
  return Math.min(RAID_DIFFICULTY.max, Math.max(0, beaten) + 1);
}

/** The server beat a raid at `difficulty`: remembered if it is the hardest yet, which unlocks the next level. */
export async function recordRaidWin(guildId: string, difficulty: number): Promise<void> {
  await collections().guilds.updateOne({ _id: guildId }, { $max: { raidDifficulty: difficulty } }, { upsert: true });
}

/** Saves the raid items a win gave, for the site's loot screen (see RaidDoc.drops). `key` names this win's. */
export async function saveRaidDrops(id: string, drops: readonly RaidDrop[], key: string): Promise<void> {
  const byUser: Record<string, string[]> = {};
  for (const drop of drops) (byUser[drop.userId] ??= []).push(drop.item.id);
  await collections().raids.updateOne({ _id: id }, { $set: { drops: byUser, lootKey: key } });
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
  summary: { damage: Record<string, number>; stats: Record<string, RaidStats>; lastHit: string | null; rounds: number; tested?: true },
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

/**
 * Of `userIds`, who won the Weekly Boss for the first time in the raid week `weekKey`: each is marked as paid for that
 * week as they are found (one conditional update each, so a member is never paid twice in a week however many raids end
 * at once). Only they are paid (rewardRaid); the rest have had this week's already.
 */
export async function claimWeeklyWins(guildId: string, userIds: readonly string[], weekKey: string): Promise<string[]> {
  const claimed: string[] = [];
  for (const userId of userIds) {
    try {
      await ensureMember(guildId, userId);
      const { modifiedCount } = await collections().members.updateOne({ guildId, userId, weeklyBossWeek: { $ne: weekKey } }, { $set: { weeklyBossWeek: weekKey } });
      if (modifiedCount === 1) claimed.push(userId);
    } catch (err) {
      console.error(`Could not mark ${userId}'s Weekly Boss win of ${weekKey} in ${guildId}:`, err);
    }
  }
  return claimed;
}

export interface RaidReward {
  /** Who could not be paid their points, komaTokens, komaGems or item (logged). Everyone else got all of it. */
  failed: string[];
  /** The raid items found (see rollRaidDrops), only the ones really given. */
  drops: RaidLoot[];
}

/** A raid item a raider was given. `isNew` when it is the only copy of it they have. */
export interface RaidLoot extends RaidDrop {
  isNew: boolean;
}

/**
 * Pays everyone who took part `reward` points, `tokens` komaTokens, `gems` komaGems and `essences` (hero essences: so
 * many of each kind), and gives the
 * party a `dropChance` chance (raidDropChance: one roll for all of them) that each finds raid-only items:
 * `counts` of each tier (raidDropCounts, by the raid's difficulty; one 3-star item, level 1's, when left out).
 */
export async function rewardRaid(
  guildId: string,
  userIds: readonly string[],
  reward: number,
  tokens: number,
  gems: number,
  dropChance = 0,
  counts?: DropCounts,
  essences: Partial<Record<EssenceId, number>> = {},
): Promise<RaidReward> {
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
  if (Object.values(essences).some((amount) => (amount ?? 0) > 0)) {
    for (const userId of userIds) {
      try {
        await giveEssences(guildId, userId, essences, 'raid_essences');
      } catch (err) {
        console.error(`Could not give ${userId} their raid essences in ${guildId}:`, err);
        failed.add(userId);
      }
    }
  }
  const drops: RaidLoot[] = [];
  for (const drop of rollRaidDrops(userIds, dropChance, counts)) {
    try {
      const { count } = await addCopy(guildId, drop.userId, drop.item.id);
      drops.push({ ...drop, isNew: count === 1 });
    } catch (err) {
      console.error(`Could not give ${drop.userId} their raid drop ${drop.item.id} in ${guildId}:`, err);
      failed.add(drop.userId);
    }
  }
  return { failed: [...failed], drops };
}

/**
 * Calls off a raid that never finished: gives every player back what they spent on boosts and what
 * the boss stole, and removes the raid. Only one
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
