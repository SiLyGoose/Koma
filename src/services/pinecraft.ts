import { randomInt } from 'node:crypto';
import type { PinecraftOre } from '../constants/index.js';
import { collections } from '../db.js';
import { newWorld, type PinecraftRules, type PinecraftWorld } from '../lib/game/pinecraft.js';
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
}

/** A member's world, made (with a new seed, full energy) the first time they play. */
export async function loadWorld(guildId: string, userId: string, rules: PinecraftRules, now = Date.now()): Promise<LoadedWorld> {
  const { pinecraftWorlds } = collections();
  const fresh = newWorld(randomInt(0, 2 ** 32), rules, now);
  const doc = await pinecraftWorlds.findOneAndUpdate(
    { _id: worldId(guildId, userId) },
    {
      $setOnInsert: {
        guildId,
        userId,
        seed: fresh.seed,
        mined: [],
        x: fresh.x,
        y: fresh.y,
        energy: fresh.energy,
        energyAt: new Date(fresh.energyAt),
        earned: 0,
        createdAt: new Date(now),
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  if (!doc) throw new Error(`Could not load the Pinecraft world of ${userId}`);
  return {
    world: { seed: doc.seed, mined: new Set(doc.mined), x: doc.x, y: doc.y, energy: doc.energy, energyAt: doc.energyAt.getTime() },
    earned: doc.earned,
  };
}

/** Saves where the miner is and their energy. */
export async function saveWhere(guildId: string, userId: string, world: PinecraftWorld): Promise<void> {
  await collections().pinecraftWorlds.updateOne(
    { _id: worldId(guildId, userId) },
    { $set: { x: world.x, y: world.y, energy: world.energy, energyAt: new Date(world.energyAt) } },
  );
}

/** Saves a block just dug (block `index`), with where the miner is and their energy after it. */
export async function saveDig(guildId: string, userId: string, world: PinecraftWorld, index: number): Promise<void> {
  await collections().pinecraftWorlds.updateOne(
    { _id: worldId(guildId, userId) },
    { $addToSet: { mined: index }, $set: { x: world.x, y: world.y, energy: world.energy, energyAt: new Date(world.energyAt) } },
  );
}

/** Pays a member `points` for an ore they dug. Returns their balance after it. */
export async function payOre(guildId: string, userId: string, ore: PinecraftOre, points: number): Promise<number> {
  await ensureMember(guildId, userId);
  const { members, pinecraftWorlds } = collections();
  const paid = await members.findOneAndUpdate({ guildId, userId }, { $inc: { points } }, { returnDocument: 'after' });
  if (!paid) throw new Error(`Member ${userId} not found while paying for Pinecraft ${ore}`);
  await pinecraftWorlds.updateOne({ _id: worldId(guildId, userId) }, { $inc: { earned: points } });
  await recordLedger([{ guildId, userId, delta: points, reason: 'pinecraft_ore' }]);
  return paid.points;
}
