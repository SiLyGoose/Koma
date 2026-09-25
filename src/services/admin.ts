import { isAdmin } from '../config.js';
import { MAX_GIVE_AMOUNT } from '../constants/index.js';
import { collections } from '../db.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { newCopyId } from '../lib/game/copies.js';
import type { ItemCopyDoc, ItemDef } from '../types.js';

/*
 * Admin-only tools for testing. Every function here checks the actor itself, so no caller can
 * skip the check.
 */

export type GiveResult =
  | { ok: false; reason: 'forbidden' | 'unknown_item' | 'bad_amount' }
  | { ok: true; item: ItemDef; given: number; total: number };

/**
 * Gives the admin `count` new copies of a catalog item, by its id. They are ordinary copies,
 * the same as pulled ones (level 0), so they can be equipped, and they show in the inventory.
 * `total` is how many of that item the admin owns now.
 */
export async function giveItems(actorId: string, guildId: string, itemId: string, count: number): Promise<GiveResult> {
  if (!isAdmin(actorId)) return { ok: false, reason: 'forbidden' };

  const item = ITEMS_BY_ID.get(itemId.toLowerCase());
  if (!item) return { ok: false, reason: 'unknown_item' };
  if (!Number.isInteger(count) || count < 1 || count > MAX_GIVE_AMOUNT) return { ok: false, reason: 'bad_amount' };

  const { items } = collections();
  // A millisecond apart, so the copies keep a stable order.
  const start = Date.now();
  const copies: ItemCopyDoc[] = Array.from({ length: count }, (_, i) => ({
    _id: newCopyId(),
    guildId,
    userId: actorId,
    itemId: item.id,
    level: 1,
    obtainedAt: new Date(start + i),
  }));
  await items.insertMany(copies);

  const total = await items.countDocuments({ guildId, userId: actorId, itemId: item.id });
  return { ok: true, item, given: count, total };
}
