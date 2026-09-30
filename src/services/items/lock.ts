import { collections } from '../../db.js';
import { stackCopies, type InventoryStack } from '../../lib/game/items/copies.js';
import { refineLevel } from '../../lib/game/items/refine.js';
import { equippedCopyIds } from '../../lib/game/items/sell.js';
import { gearChanged } from './gear-events.js';

/*
 * Locking gear (commands/lock.ts, and the site's gear page), one copy at a time: a locked copy
 * (ItemCopyDoc.locked) is never sold (services/items/sell.ts) and never used up by a refine
 * (services/items/refine.ts). It can still be worn, refined itself and forged.
 */

/** Locks or unlocks one of the member's copies. False when they don't own it. */
export async function setCopyLocked(guildId: string, userId: string, copyId: string, locked: boolean): Promise<boolean> {
  const result = await collections().items.updateOne({ _id: copyId, guildId, userId }, { $set: { locked } });
  if (result.matchedCount === 0) return false;
  if (result.modifiedCount > 0) gearChanged(guildId, userId);
  return true;
}

/** The member's copies of an item, stacked as the inventory lists them (copies alike in level, lock and being worn). */
export async function itemStacks(guildId: string, userId: string, itemId: string): Promise<InventoryStack[]> {
  const { items, members } = collections();
  const [copies, member] = await Promise.all([items.find({ guildId, userId, itemId }).toArray(), members.findOne({ guildId, userId })]);
  return stackCopies(copies, equippedCopyIds(member?.equipment));
}

/**
 * Locks (or unlocks) one copy from a stack of the member's copies of `stack.itemId`: one at its level, worn or not as the
 * stack is, and not yet locked (or unlocked). Locking takes a masterwork first; unlocking leaves it for last.
 * False when there's no such copy any more.
 */
export async function setOneLocked(guildId: string, userId: string, stack: Pick<InventoryStack, 'itemId' | 'level' | 'worn'>, locked: boolean): Promise<boolean> {
  const { items, members } = collections();
  const [copies, member] = await Promise.all([items.find({ guildId, userId, itemId: stack.itemId }).toArray(), members.findOne({ guildId, userId })]);
  const worn = equippedCopyIds(member?.equipment);
  const candidates = copies
    .filter((copy) => refineLevel(copy.level) === stack.level && worn.has(copy._id) === stack.worn && (copy.locked === true) !== locked)
    .sort((a, b) => (Number(b.masterwork === true) - Number(a.masterwork === true)) * (locked ? 1 : -1));
  for (const copy of candidates) {
    const result = await items.updateOne({ _id: copy._id, guildId, userId, locked: locked ? { $ne: true } : true }, { $set: { locked } });
    if (result.modifiedCount > 0) {
      gearChanged(guildId, userId);
      return true;
    }
  }
  return false;
}
