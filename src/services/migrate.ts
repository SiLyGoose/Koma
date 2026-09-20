import { collections } from '../db.js';
import { bestCopy } from '../lib/copies.js';
import type { ItemCopyDoc } from '../types.js';
import { SLOTS } from '../types.js';

/*
 * One-time move from the old inventory (one document per item with a count, in the
 * `inventory` collection) to one document per copy (the `items` collection).
 *
 *   1. Every old stack of N becomes N copies at level 0. Their ids are made from the old
 *      document's id, so running this twice (or after a crash halfway) never duplicates
 *      anything. Each old document is marked with `migratedAt` once its copies exist.
 *   2. Equipped items used to be stored as item ids. They are changed to the id of the
 *      member's best copy of that item (or cleared if they no longer own one).
 *
 * When both steps are done a marker is saved in the `meta` collection, and later starts skip
 * everything. The old `inventory` collection is left in place, untouched apart from the
 * `migratedAt` marks, so nothing is lost; it can be deleted whenever you like.
 */

const MARKER_ID = 'itemCopies';
const BATCH = 500;

export interface MigrationResult {
  skipped: boolean;
  stacks: number;
  copies: number;
  equipped: number;
}

export async function migrateInventory(): Promise<MigrationResult> {
  const { inventory, items, members, meta } = collections();

  if (await meta.findOne({ _id: MARKER_ID })) return { skipped: true, stacks: 0, copies: 0, equipped: 0 };

  // Step 1: old stacks -> copies.
  let stacks = 0;
  let copies = 0;
  const pending = await inventory.find({ migratedAt: null }).toArray();
  for (const stack of pending) {
    const wanted: ItemCopyDoc[] = [];
    const count = Math.max(0, Math.floor(Number(stack.count) || 0));
    for (let i = 0; i < count; i++) {
      wanted.push({
        _id: `legacy-${String(stack._id)}-${i}`,
        guildId: stack.guildId,
        userId: stack.userId,
        itemId: stack.itemId,
        level: 0,
        obtainedAt: stack.firstObtainedAt ?? new Date(),
      });
    }

    for (let start = 0; start < wanted.length; start += BATCH) {
      const chunk = wanted.slice(start, start + BATCH);
      // Skip copies that already exist from an interrupted earlier run.
      const existing = await items.find({ _id: { $in: chunk.map((copy) => copy._id) } }).toArray();
      const have = new Set(existing.map((copy) => copy._id));
      const missing = chunk.filter((copy) => !have.has(copy._id));
      if (missing.length > 0) {
        await items.insertMany(missing);
        copies += missing.length;
      }
    }
    await inventory.updateOne({ _id: stack._id }, { $set: { migratedAt: new Date() } });
    stacks += 1;
  }

  // Step 2: equipped item ids -> copy ids.
  let equipped = 0;
  const wearing = await members.find({ equipment: { $exists: true } }).toArray();
  for (const member of wearing) {
    for (const slot of SLOTS) {
      const stored = member.equipment?.[slot];
      if (!stored) continue;

      const { guildId, userId } = member;
      const alreadyCopy = await items.findOne({ guildId, userId, _id: stored });
      if (alreadyCopy) continue;

      const owned = await items.find({ guildId, userId, itemId: stored }).toArray();
      const copy = bestCopy(owned);
      await members.updateOne({ guildId, userId }, { $set: { [`equipment.${slot}`]: copy?._id ?? null } });
      equipped += 1;
    }
  }

  await meta.updateOne({ _id: MARKER_ID }, { $set: { migratedAt: new Date(), stacks, copies, equipped } }, { upsert: true });
  return { skipped: false, stacks, copies, equipped };
}
