import { collections } from '../db.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { equippedCopyIds, saleCount, saleLines, saleTotal, worstCopies, worstCopy, type SaleLine } from '../lib/sell.js';
import type { ItemCopyDoc, ItemDef, LedgerDoc, Stars } from '../types.js';
import { ensureMember } from './economy.js';

/*
 * Selling items for points. A member can sell copies they aren't wearing: one copy of an item,
 * every unworn copy of an item, or every unworn item of a star tier. Selling has two steps so a
 * big sale can be confirmed first: `planSale` works out exactly which copies would be sold and
 * what they are worth, and `sellCopies` sells those copies (and only those, and only if they are
 * still theirs and still not worn). The worn copy of an item is never sold, but other copies of
 * the same item can be.
 */

/** What to sell. */
export type SellTarget =
  | { kind: 'one'; item: ItemDef }
  /** `amount` copies of an item, the ones they would sell first. */
  | { kind: 'some'; item: ItemDef; amount: number }
  | { kind: 'allOf'; item: ItemDef }
  | { kind: 'stars'; stars: Stars };

export type SalePlan =
  | { ok: true; copyIds: string[]; lines: SaleLine[]; count: number; total: number }
  /** They own none of it. */
  | { ok: false; reason: 'not_owned' }
  /** They own some, but every copy is worn. */
  | { ok: false; reason: 'only_equipped' }
  /** They asked for more copies than they can sell (`available` are not worn). */
  | { ok: false; reason: 'not_enough'; available: number };

/** Works out what selling `target` would sell and earn, without changing anything. */
export async function planSale(guildId: string, userId: string, target: SellTarget): Promise<SalePlan> {
  const { items, members } = collections();
  const [copies, member] = await Promise.all([items.find({ guildId, userId }).toArray(), members.findOne({ guildId, userId })]);
  const worn = equippedCopyIds(member?.equipment);

  const inScope = copies.filter((copy) => {
    const item = ITEMS_BY_ID.get(copy.itemId);
    if (!item) return false;
    return target.kind === 'stars' ? item.stars === target.stars : item.id === target.item.id;
  });
  if (inScope.length === 0) return { ok: false, reason: 'not_owned' };

  const sellable = inScope.filter((copy) => !worn.has(copy._id));
  if (sellable.length === 0) return { ok: false, reason: 'only_equipped' };

  if (target.kind === 'some' && sellable.length < target.amount) return { ok: false, reason: 'not_enough', available: sellable.length };

  const chosen =
    target.kind === 'one' ? [worstCopy(sellable) as ItemCopyDoc] : target.kind === 'some' ? worstCopies(sellable, target.amount) : sellable;
  const lines = saleLines(chosen.map((copy) => copy.itemId));
  return { ok: true, copyIds: chosen.map((copy) => copy._id), lines, count: saleCount(lines), total: saleTotal(lines) };
}

export type SaleResult =
  | {
      ok: true;
      /** What was actually sold. */
      lines: SaleLine[];
      earned: number;
      balance: number;
      /** How many of the planned copies could not be sold any more (worn, or sold in the meantime). */
      skipped: number;
    }
  /** None of the copies could be sold. */
  | { ok: false; reason: 'nothing_to_sell' };

/**
 * Sells these copies. Each one is only sold if it is still owned by the member and is not worn
 * right now, so a sale can never take gear they put on after it was planned. Points are paid for
 * exactly the copies that were removed, so two sales of the same copies at once pay only once.
 */
export async function sellCopies(guildId: string, userId: string, copyIds: readonly string[]): Promise<SaleResult> {
  const { items, members, ledger } = collections();
  await ensureMember(guildId, userId);

  const member = await members.findOne({ guildId, userId });
  const worn = equippedCopyIds(member?.equipment);
  const candidates = (await items.find({ guildId, userId, _id: { $in: [...copyIds] } }).toArray()).filter(
    (copy) => !worn.has(copy._id) && ITEMS_BY_ID.has(copy.itemId),
  );

  // Remove the copies one item at a time, so we know exactly how many of each were really removed.
  const byItem = new Map<string, ItemCopyDoc[]>();
  for (const copy of candidates) byItem.set(copy.itemId, [...(byItem.get(copy.itemId) ?? []), copy]);

  const removedDocs: ItemCopyDoc[] = [];
  let allRemoved = true;
  for (const [, group] of byItem) {
    const result = await items.deleteMany({ guildId, userId, _id: { $in: group.map((copy) => copy._id) } });
    if (result.deletedCount < group.length) allRemoved = false; // another sale removed some of these at the same moment
    // Every copy in a group is of the same item, so only how many we removed matters for the pay.
    removedDocs.push(...group.slice(0, result.deletedCount));
  }

  const lines = saleLines(removedDocs.map((copy) => copy.itemId));
  const earned = saleTotal(lines);
  if (removedDocs.length === 0) return { ok: false, reason: 'nothing_to_sell' };

  let balance: number;
  try {
    if (earned > 0) {
      const updated = await members.findOneAndUpdate({ guildId, userId }, { $inc: { points: earned } }, { returnDocument: 'after' });
      balance = updated?.points ?? earned;
    } else {
      balance = (await members.findOne({ guildId, userId }))?.points ?? 0;
    }
  } catch (err) {
    // Could not pay, so give the copies back (only when we know nobody else touched them).
    if (allRemoved) {
      try {
        await items.insertMany(removedDocs);
      } catch (restoreErr) {
        console.error('Could not give back the copies of a failed sale:', restoreErr);
      }
    } else {
      console.error('A sale failed to pay out while another sale was running; some copies were not restored.');
    }
    throw err;
  }

  const entries: LedgerDoc[] = lines
    .filter((line) => line.total > 0)
    .map((line) => ({ guildId, userId, delta: line.total, reason: 'sell' as const, itemId: line.item.id, createdAt: new Date() }));
  if (entries.length > 0) {
    try {
      await ledger.insertMany(entries);
    } catch (err) {
      console.error('Failed to write ledger entries:', err);
    }
  }

  return { ok: true, lines, earned, balance, skipped: copyIds.length - removedDocs.length };
}
