import { collections } from '../../db.js';
import { REFINE } from '../../constants/index.js';
import type { RaidClassId } from '../../constants/raid.js';
import { tmStoneCost } from '../../constants/technomagic.js';
import { tmStoneClass } from '../../data/kr-gear.js';
import { leastStars, refineable, refineCopyPlan, refineCost, refineLevel, refinePlan } from '../../lib/game/items/refine.js';
import { equippedCopyIds } from '../../lib/game/items/sell.js';
import { keptCopyIds } from '../../lib/game/items/loadouts.js';
import type { ItemCopyDoc, ItemDef } from '../../types.js';
import { heroOnly, topTier } from '../../lib/game/heroes.js';
import { recordLedger } from '../economy/shared.js';
import { gearChanged } from './gear-events.js';

/*
 * Refining (commands/refine.ts, rules in constants/items/refine.ts): one duplicate copy of an item and
 * some points (refine.cost, burned) are used up to raise another copy of it by one level; a TechnoMagic piece's, its class's
 * Upgrade Stones in place of the duplicate (King's Raid's: constants/technomagic.ts TM_STONES). The points
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
      /** A TechnoMagic piece's: the Upgrade Stones it used (its class's), how many are left, and how many the next one takes (null at the top level). */
      stones?: { class: RaidClassId; paid: number; left: number; next: number | null };
    }
  | { ok: false; reason: 'not_owned' | 'no_duplicate' | 'maxed'; level: number }
  /** TechnoMagic gear, which is never refined (refineable). Nothing was used up. */
  | { ok: false; reason: 'not_refineable' }
  /** The material picked (on the site) isn't a copy that can be used up. Nothing was used up. */
  | { ok: false; reason: 'bad_material'; level: number }
  /** A TechnoMagic piece: they haven't the Upgrade Stones of its class (`cls`) it takes (`need`; `have`). Nothing was used up. */
  | { ok: false; reason: 'no_stones'; level: number; cls: RaidClassId; need: number; have: number }
  /** They can't pay for it. `price` is what it costs, `balance` what they have. Nothing was used up. */
  | { ok: false; reason: 'too_poor'; level: number; price: number; balance: number }
  /** The copies changed while refining (another refine, sale or gift at the same moment). Nothing was used up. */
  | { ok: false; reason: 'busy' };

/**
 * Refines the member's worn (or saved, or best) copy of `item` by one level, using up their
 * lowest-level copy that is in no loadout and not locked, and the price. The refined copy is locked. With `chosen` (the site's forge) it refines
 * that copy instead, using up the material picked (or, with none, the lowest-level one it could use). TechnoMagic gear never is.
 */
export async function refineItem(guildId: string, userId: string, item: ItemDef, chosen?: { copy: string; material: string | null }): Promise<RefineResult> {
  if (!refineable(item)) return { ok: false, reason: 'not_refineable' };
  const { items, members } = collections();
  const [copies, member] = await Promise.all([items.find({ guildId, userId, itemId: item.id }).toArray(), members.findOne({ guildId, userId })]);
  const worn = equippedCopyIds(member?.equipment);
  const kept = keptCopyIds(member);
  // (A hero's gear from 0★, the members' own from 1★.)
  const least = leastStars(item);
  // (A TechnoMagic piece: its class's Upgrade Stones, no duplicate.)
  const cls = tmStoneClass(item);
  if (cls) {
    const plan = refinePlan(copies, worn, kept, least);
    const target = chosen ? copies.find((copy) => copy._id === chosen.copy) : plan.ok || plan.reason === 'no_duplicate' ? plan.target : undefined;
    if (!chosen && !plan.ok && plan.reason === 'maxed') return { ok: false, reason: 'maxed', level: plan.level };
    if (!target) return { ok: false, reason: 'not_owned', level: 0 };
    return refineWithStones(guildId, userId, item, target, cls, least, member?.stones?.[cls] ?? 0, member?.points ?? 0);
  }
  const plan = chosen ? refineCopyPlan(copies, chosen.copy, chosen.material, new Set([...worn, ...kept]), least) : refinePlan(copies, worn, kept, least);
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
    // (Locked by it, but of a hero's gear only its T10.)
    { $set: { level: plan.to, ...((!heroOnly(item) || topTier(item)) && { locked: true }) } },
    { returnDocument: 'after' },
  );
  if (!raised) {
    await items.insertOne(used).catch((err) => console.error(`Could not give back the duplicate ${used._id} after a failed refine:`, err));
    await refund();
    return { ok: false, reason: 'busy' };
  }
  await recordLedger([{ guildId, userId, delta: -cost, reason: 'refine', itemId: item.id }]);
  gearChanged(guildId, userId);
  const maxedCopies = copies.filter((copy) => copy._id !== plan.target._id && refineLevel(copy.level, least) >= REFINE.maxLevel).length;
  const lockedCopies = copies.filter((copy) => copy._id !== plan.target._id && copy.locked && refineLevel(copy.level, least) < REFINE.maxLevel).length;
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

/**
 * Awakens `target`, a TechnoMagic piece, by one star with its class's (`cls`) Upgrade Stones and the price: both taken at
 * once (or neither), then the copy raised; if it changed meanwhile, both are given back. `have` and `balance`: their stones
 * and points as last read (for what a refusal says).
 */
async function refineWithStones(guildId: string, userId: string, item: ItemDef, target: ItemCopyDoc, cls: RaidClassId, least: number, have: number, balance: number): Promise<RefineResult> {
  const { items, members } = collections();
  const from = refineLevel(target.level, least);
  if (from >= REFINE.maxLevel) return { ok: false, reason: 'maxed', level: from };
  const to = from + 1;
  const cost = refineCost(item.stars, to);
  const reclaimed = target.reclaimed === true;
  const need = tmStoneCost(to, reclaimed);
  const field = `stones.${cls}`;
  const charged = await members.findOneAndUpdate({ guildId, userId, points: { $gte: cost }, [field]: { $gte: need } }, { $inc: { points: -cost, [field]: -need } }, { returnDocument: 'after' });
  if (!charged) {
    const now = await members.findOne({ guildId, userId }, { projection: { points: 1, stones: 1 } });
    const stones = now?.stones?.[cls] ?? have;
    if (stones < need) return { ok: false, reason: 'no_stones', level: from, cls, need, have: stones };
    return { ok: false, reason: 'too_poor', level: from, price: cost, balance: now?.points ?? balance };
  }
  const raised = await items.findOneAndUpdate(
    { _id: target._id, guildId, userId, level: target.level },
    { $set: { level: to, ...((!heroOnly(item) || topTier(item)) && { locked: true }) } },
    { returnDocument: 'after' },
  );
  if (!raised) {
    await members.updateOne({ guildId, userId }, { $inc: { points: cost, [field]: need } }).catch((err) => console.error(`Could not give back ${cost} and ${need} stones after a failed awakening:`, err));
    return { ok: false, reason: 'busy' };
  }
  await recordLedger([{ guildId, userId, delta: -cost, reason: 'refine', itemId: item.id }]);
  gearChanged(guildId, userId);
  const left = charged.stones?.[cls] ?? 0;
  return {
    ok: true,
    item,
    from,
    to,
    duplicatesLeft: 0,
    maxedCopies: 0,
    paid: cost,
    balance: charged.points,
    nextCost: to < REFINE.maxLevel ? refineCost(item.stars, to + 1) : null,
    stones: { class: cls, paid: need, left, next: to < REFINE.maxLevel ? tmStoneCost(to + 1, reclaimed) : null },
  };
}
