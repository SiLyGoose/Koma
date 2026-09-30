import { collections } from '../../db.js';
import { REFINE } from '../../constants/index.js';
import { refineCopyPlan, refineCost, refineLevel, refinePlan } from '../../lib/game/items/refine.js';
import { equippedCopyIds } from '../../lib/game/items/sell.js';
import { loadoutCopyIds } from '../../lib/game/items/loadouts.js';
import type { ItemDef } from '../../types.js';
import { recordLedger } from '../economy/shared.js';
import { gearChanged } from './gear-events.js';

/*
 * Refining (commands/refine.ts, rules in constants/items/refine.ts): one duplicate copy of an item and
 * some points (refine.cost, burned) are used up to raise another copy of it by one level. The points
 * are taken first and the duplicate removed next, each in one conditional update, so two refines at
 * once can never both use them; if a later step fails (the copies changed in the meantime), what was
 * already taken is given back.
 */

export type RefineResult =
  | {
      ok: true;
      item: ItemDef;
      from: number;
      to: number;
      /** Copies of the item left that could still be used for later refines (fully refined and locked ones don't count). */
      duplicatesLeft: number;
      /** Their other copies of the item already fully refined: this refine raised an extra copy. */
      maxedCopies: number;
      /** Points this refine cost, and what the member has left. */
      paid: number;
      balance: number;
      /** What the next refine would cost, or null at the top level. */
      nextCost: number | null;
    }
  | { ok: false; reason: 'not_owned' | 'no_duplicate' | 'maxed'; level: number }
  /** The material picked (on the site) isn't a copy that can be used up. Nothing was used up. */
  | { ok: false; reason: 'bad_material'; level: number }
  /** They can't pay for it. `price` is what it costs, `balance` what they have. Nothing was used up. */
  | { ok: false; reason: 'too_poor'; level: number; price: number; balance: number }
  /** The copies changed while refining (another refine, sale or gift at the same moment). Nothing was used up. */
  | { ok: false; reason: 'busy' };

/**
 * Refines the member's worn (or saved, or best) copy of `item` by one level, using up their
 * lowest-level copy that is in no loadout and not locked, and the price. With `chosen` (the site's forge) it refines
 * that copy instead, using up the material picked (or, with none, the lowest-level one it could use).
 */
export async function refineItem(guildId: string, userId: string, item: ItemDef, chosen?: { copy: string; material: string | null }): Promise<RefineResult> {
  const { items, members } = collections();
  const [copies, member] = await Promise.all([items.find({ guildId, userId, itemId: item.id }).toArray(), members.findOne({ guildId, userId })]);
  const worn = equippedCopyIds(member?.equipment);
  const kept = loadoutCopyIds(member);
  const plan = chosen ? refineCopyPlan(copies, chosen.copy, chosen.material, new Set([...worn, ...kept])) : refinePlan(copies, worn, kept);
  if (!plan.ok) return { ok: false, reason: plan.reason, level: plan.level };

  const cost = refineCost(item.stars, plan.to);
  const charged = await members.findOneAndUpdate({ guildId, userId, points: { $gte: cost } }, { $inc: { points: -cost } }, { returnDocument: 'after' });
  if (!charged) return { ok: false, reason: 'too_poor', level: plan.from, price: cost, balance: member?.points ?? 0 };
  const refund = async () => {
    if (cost <= 0) return;
    await members.updateOne({ guildId, userId }, { $inc: { points: cost } }).catch((err) => console.error(`Could not give back ${cost} after a failed refine:`, err));
  };

  const used = await items.findOneAndDelete({ _id: plan.fodder._id, guildId, userId, locked: { $ne: true } });
  if (!used) {
    await refund();
    return { ok: false, reason: 'busy' };
  }
  const raised = await items.findOneAndUpdate(
    { _id: plan.target._id, guildId, userId, level: plan.target.level },
    { $set: { level: plan.to } },
    { returnDocument: 'after' },
  );
  if (!raised) {
    await items.insertOne(used).catch((err) => console.error(`Could not give back the duplicate ${used._id} after a failed refine:`, err));
    await refund();
    return { ok: false, reason: 'busy' };
  }
  await recordLedger([{ guildId, userId, delta: -cost, reason: 'refine', itemId: item.id }]);
  gearChanged(guildId, userId);
  const maxedCopies = copies.filter((copy) => copy._id !== plan.target._id && refineLevel(copy.level) >= REFINE.maxLevel).length;
  const lockedCopies = copies.filter((copy) => copy._id !== plan.target._id && copy.locked && refineLevel(copy.level) < REFINE.maxLevel).length;
  return {
    ok: true,
    item,
    from: plan.from,
    to: plan.to,
    duplicatesLeft: copies.length - 2 - maxedCopies - lockedCopies,
    maxedCopies,
    paid: cost,
    balance: charged.points,
    nextCost: plan.to < REFINE.maxLevel ? refineCost(item.stars, plan.to + 1) : null,
  };
}
