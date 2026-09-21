import { randomBytes } from 'node:crypto';
import type { ItemCopyDoc } from '../../types.js';

/**
 * What a member owns is stored as one document per copy of an item (see ItemCopyDoc), so two
 * copies of the same item can differ (an upgrade level, later maybe more) and one copy can be
 * traded on its own. These helpers are the pure parts of working with copies.
 */

/** A fresh, effectively unique id for a copy (24 hex characters). */
export function newCopyId(): string {
  return randomBytes(12).toString('hex');
}

/** What the inventory shows for one kind of item: how many copies, and the highest level among them. */
export interface InventoryEntry {
  itemId: string;
  count: number;
  bestLevel: number;
}

type CopyInfo = Pick<ItemCopyDoc, 'itemId' | 'level' | 'obtainedAt'>;

/** Groups copies by item, in the order each item was first obtained. */
export function groupCopies(copies: readonly CopyInfo[]): InventoryEntry[] {
  const sorted = [...copies].sort((a, b) => a.obtainedAt.getTime() - b.obtainedAt.getTime());
  const entries = new Map<string, InventoryEntry>();
  for (const copy of sorted) {
    const entry = entries.get(copy.itemId);
    if (entry) {
      entry.count += 1;
      entry.bestLevel = Math.max(entry.bestLevel, copy.level);
    } else {
      entries.set(copy.itemId, { itemId: copy.itemId, count: 1, bestLevel: copy.level });
    }
  }
  return [...entries.values()];
}

/**
 * The copy to use when someone equips an item by name: the highest level, then the one
 * obtained first, then the lowest id so the choice is always the same.
 */
export function bestCopy<T extends Pick<ItemCopyDoc, '_id' | 'level' | 'obtainedAt'>>(copies: readonly T[]): T | undefined {
  let best: T | undefined;
  for (const copy of copies) {
    if (!best) {
      best = copy;
      continue;
    }
    if (copy.level !== best.level) {
      if (copy.level > best.level) best = copy;
    } else if (copy.obtainedAt.getTime() !== best.obtainedAt.getTime()) {
      if (copy.obtainedAt.getTime() < best.obtainedAt.getTime()) best = copy;
    } else if (copy._id < best._id) {
      best = copy;
    }
  }
  return best;
}
