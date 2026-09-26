import { collections } from '../db.js';
import { refinePlan } from '../lib/game/refine.js';
import { equippedCopyIds } from '../lib/game/sell.js';
import { loadoutCopyIds } from '../lib/game/loadouts.js';
import type { ItemDef } from '../types.js';
import { recordLedger } from './economy/shared.js';

/*
 * Refining (commands/refine.ts, rules in constants/refine.ts): one duplicate copy of an item is
 * used up to raise another copy of it by one level. The duplicate is removed first, in one
 * conditional delete, so two refines at once can never both use it; if the raise then fails (the
 * copy changed in the meantime), the duplicate is put back.
 */

export type RefineResult =
  | {
      ok: true;
      item: ItemDef;
      from: number;
      to: number;
      /** Copies of the item left that could still be used for later refines. */
      duplicatesLeft: number;
    }
  | { ok: false; reason: 'not_owned' | 'no_duplicate' | 'maxed'; level: number }
  /** The copies changed while refining (another refine, sale or gift at the same moment). Nothing was used up. */
  | { ok: false; reason: 'busy' };

/** Refines the member's worn (or saved, or best) copy of `item` by one level, using up their lowest-level copy that is in no loadout. */
export async function refineItem(guildId: string, userId: string, item: ItemDef): Promise<RefineResult> {
  const { items, members } = collections();
  const [copies, member] = await Promise.all([items.find({ guildId, userId, itemId: item.id }).toArray(), members.findOne({ guildId, userId })]);
  const plan = refinePlan(copies, equippedCopyIds(member?.equipment), loadoutCopyIds(member));
  if (!plan.ok) return plan;

  const used = await items.findOneAndDelete({ _id: plan.fodder._id, guildId, userId });
  if (!used) return { ok: false, reason: 'busy' };
  const raised = await items.findOneAndUpdate(
    { _id: plan.target._id, guildId, userId, level: plan.target.level },
    { $set: { level: plan.to } },
    { returnDocument: 'after' },
  );
  if (!raised) {
    await items.insertOne(used).catch((err) => console.error(`Could not give back the duplicate ${used._id} after a failed refine:`, err));
    return { ok: false, reason: 'busy' };
  }
  await recordLedger([{ guildId, userId, delta: 0, reason: 'refine', itemId: item.id }]);
  return { ok: true, item, from: plan.from, to: plan.to, duplicatesLeft: copies.length - 2 };
}
