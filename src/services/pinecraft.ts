import { randomInt } from 'node:crypto';
import { PINECRAFT_WORLD } from '../constants/index.js';
import { collections } from '../db.js';
import { newWorld, pinecraftWeek, type PinecraftRules, type PinecraftWorld } from '../lib/game/pinecraft.js';
import { ensureMember, recordLedger } from './economy/shared.js';

/*
 * The database side of Pinecraft. A member's world is loaded when they start playing and kept in
 * memory while they do (web/pinecraft/server.ts, one page per member), and every block dug is saved
 * as it is dug, before any ore in it is paid: a block can't be dug twice, so an ore can't be paid twice.
 */

const worldId = (guildId: string, userId: string): string => `${guildId}:${userId}`;

export interface LoadedWorld {
  world: PinecraftWorld;
  /** Points its ores have paid, all told. */
  earned: number;
  /** The week the world is for (pinecraftWeek's key). */
  week: string;
}

/**
 * A member's world, made (with a new seed, full energy) the first time they play. A world from an
 * earlier week, or made with an older layout, is started over (its energy and what it earned are kept).
 */
export async function loadWorld(guildId: string, userId: string, rules: PinecraftRules, now = Date.now()): Promise<LoadedWorld> {
  const { pinecraftWorlds } = collections();
  const _id = worldId(guildId, userId);
  const fresh = newWorld(randomInt(0, 2 ** 32), rules, now);
  const week = pinecraftWeek(now).key;
  const layout = { seed: fresh.seed, version: PINECRAFT_WORLD.version, week, mined: [], x: fresh.x, y: fresh.y, sinceBlast: 0 };
  let doc = await pinecraftWorlds.findOneAndUpdate(
    { _id },
    { $setOnInsert: { guildId, userId, ...layout, energy: fresh.energy, energyAt: new Date(fresh.energyAt), earned: 0, dugTotal: 0, createdAt: new Date(now) } },
    { upsert: true, returnDocument: 'after' },
  );
  if (doc && (doc.version !== PINECRAFT_WORLD.version || doc.week !== week)) {
    // Only if it is still the old one (another load may have just started it over).
    const was = <T>(value: T | undefined) => (value === undefined ? { $exists: false } : value);
    doc =
      (await pinecraftWorlds.findOneAndUpdate({ _id, version: was(doc.version), week: was(doc.week) }, { $set: layout }, { returnDocument: 'after' })) ??
      (await pinecraftWorlds.findOne({ _id }));
  }
  if (!doc) throw new Error(`Could not load the Pinecraft world of ${userId}`);
  // A world from before blocks were counted all told: it starts from what it has dug this week.
  if (doc.dugTotal === undefined) {
    await pinecraftWorlds.updateOne({ _id, dugTotal: { $exists: false } }, { $set: { dugTotal: doc.mined.length } });
  }
  return {
    world: { seed: doc.seed, mined: new Set(doc.mined), x: doc.x, y: doc.y, energy: doc.energy, energyAt: doc.energyAt.getTime(), sinceBlast: doc.sinceBlast ?? 0 },
    earned: doc.earned,
    week: doc.week ?? week,
  };
}

/** Starts a world over for a new week (while it is being played): a new seed, nothing dug, the miner back in the room. */
export async function newWeek(guildId: string, userId: string, world: PinecraftWorld, week: string): Promise<void> {
  await collections().pinecraftWorlds.updateOne(
    { _id: worldId(guildId, userId) },
    { $set: { seed: world.seed, version: PINECRAFT_WORLD.version, week, mined: [], x: world.x, y: world.y, sinceBlast: 0, energy: world.energy, energyAt: new Date(world.energyAt) } },
  );
}

/** Saves where the miner is and their energy. */
export async function saveWhere(guildId: string, userId: string, world: PinecraftWorld): Promise<void> {
  await collections().pinecraftWorlds.updateOne(
    { _id: worldId(guildId, userId) },
    { $set: { x: world.x, y: world.y, energy: world.energy, energyAt: new Date(world.energyAt) } },
  );
}

/** Saves the blocks just broken (a dig, and any blast), with where the miner is and their energy after it. */
export async function saveDig(guildId: string, userId: string, world: PinecraftWorld, indices: readonly number[]): Promise<void> {
  await collections().pinecraftWorlds.updateOne(
    { _id: worldId(guildId, userId) },
    {
      $addToSet: { mined: { $each: [...indices] } },
      $set: { x: world.x, y: world.y, energy: world.energy, energyAt: new Date(world.energyAt), sinceBlast: world.sinceBlast },
      $inc: { dugTotal: indices.length },
    },
  );
}

/** Pays a member `points` for the ores a dig (and any blast) broke. Returns their balance after it. */
export async function payOre(guildId: string, userId: string, points: number): Promise<number> {
  await ensureMember(guildId, userId);
  const { members, pinecraftWorlds } = collections();
  const paid = await members.findOneAndUpdate({ guildId, userId }, { $inc: { points } }, { returnDocument: 'after' });
  if (!paid) throw new Error(`Member ${userId} not found while paying for Pinecraft ores`);
  await pinecraftWorlds.updateOne({ _id: worldId(guildId, userId) }, { $inc: { earned: points } });
  await recordLedger([{ guildId, userId, delta: points, reason: 'pinecraft_ore' }]);
  return paid.points;
}

/** What Pinecraft's leaderboards rank by: blocks dug all told, or points earned from ores. */
export type PinecraftStat = 'dug' | 'earned';

export interface LeaderboardEntry {
  userId: string;
  value: number;
}

export interface PinecraftLeaderboard {
  /** The top miners in the server, best first. */
  top: LeaderboardEntry[];
  /** The one asking: where they stand (null if they have never played). */
  you: (LeaderboardEntry & { rank: number }) | null;
}

const STAT_FIELD = { dug: 'dugTotal', earned: 'earned' } as const;

/** A server's best miners by `stat` (the top `limit`, nobody at 0), and where `userId` stands. */
export async function pinecraftLeaderboard(guildId: string, stat: PinecraftStat, userId: string, limit = 10): Promise<PinecraftLeaderboard> {
  const { pinecraftWorlds } = collections();
  const field = STAT_FIELD[stat];
  const docs = await pinecraftWorlds
    .find({ guildId, [field]: { $gt: 0 } }, { projection: { userId: 1, [field]: 1 } })
    .sort({ [field]: -1, userId: 1 })
    .limit(limit)
    .toArray();
  const valueOf = (doc: Record<string, unknown>): number => (typeof doc[field] === 'number' ? (doc[field] as number) : 0);
  const top = docs.map((doc) => ({ userId: doc.userId, value: valueOf(doc as unknown as Record<string, unknown>) }));
  const mine = await pinecraftWorlds.findOne({ guildId, userId }, { projection: { [field]: 1 } });
  let you: PinecraftLeaderboard['you'] = null;
  if (mine) {
    const value = valueOf(mine as unknown as Record<string, unknown>);
    const ahead = await pinecraftWorlds.countDocuments({ guildId, [field]: { $gt: value } });
    you = { userId, value, rank: ahead + 1 };
  }
  return { top, you };
}
