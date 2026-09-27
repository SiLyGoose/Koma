import { randomInt } from 'node:crypto';
import { PINECRAFT_WORLD } from '../constants/index.js';
import { collections } from '../db.js';
import { newWorld, pinecraftWeek, type PinecraftRules, type PinecraftWorld } from '../lib/game/pinecraft.js';
import { ensureMember, recordLedger } from './economy/shared.js';

/*
 * The database side of Pinecraft. A member's world is loaded when they start playing and kept in
 * memory while they do (web/pinecraft-session.ts, one page per member), and every block dug is saved
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
    { $setOnInsert: { guildId, userId, ...layout, energy: fresh.energy, energyAt: new Date(fresh.energyAt), earned: 0, createdAt: new Date(now) } },
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
