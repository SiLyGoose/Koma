import { collections } from '../../db.js';
import { REFINE } from '../../constants/index.js';
import { tmStoneCost } from '../../constants/technomagic.js';
import { tmStoneClass } from '../../data/kr-gear.js';
import { leastStars, refineable, refineCopyPlan, refineCost, refineLevel, refinePlan } from '../../lib/game/items/refine.js';
import { equippedCopyIds } from '../../lib/game/items/sell.js';
import { keptCopyIds } from '../../lib/game/items/loadouts.js';
import { heroOnly, topTier } from '../../lib/game/heroes.js';
import { recordLedger } from '../economy/shared.js';
import { gearChanged } from './gear-events.js';
/**
 * Refines the member's worn (or saved, or best) copy of `item` by one level, using up their
 * lowest-level copy that is in no loadout and not locked, and the price. The refined copy is locked. With `chosen` (the site's forge) it refines
 * that copy instead, using up the material picked (or, with none, the lowest-level one it could use). TechnoMagic gear never is.
 */
export async function refineItem(guildId, userId, item, chosen) {
    if (!refineable(item))
        return { ok: false, reason: 'not_refineable' };
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
        if (!chosen && !plan.ok && plan.reason === 'maxed')
            return { ok: false, reason: 'maxed', level: plan.level };
        if (!target)
            return { ok: false, reason: 'not_owned', level: 0 };
        return refineWithStones(guildId, userId, item, target, cls, least, member?.stones?.[cls] ?? 0, member?.points ?? 0);
    }
    const plan = chosen ? refineCopyPlan(copies, chosen.copy, chosen.material, new Set([...worn, ...kept]), least) : refinePlan(copies, worn, kept, least);
    if (!plan.ok)
        return { ok: false, reason: plan.reason, level: plan.level };
    const cost = refineCost(item.stars, plan.to);
    const charged = await members.findOneAndUpdate({ guildId, userId, points: { $gte: cost } }, { $inc: { points: -cost } }, { returnDocument: 'after' });
    if (!charged)
        return { ok: false, reason: 'too_poor', level: plan.from, price: cost, balance: member?.points ?? 0 };
    const refund = async () => {
        if (cost <= 0)
            return;
        await members.updateOne({ guildId, userId }, { $inc: { points: cost } }).catch((err) => console.error(`Could not give back ${cost} after a failed refine:`, err));
    };
    const used = await items.findOneAndDelete({ _id: plan.fodder._id, guildId, userId, locked: { $ne: true } });
    if (!used) {
        await refund();
        return { ok: false, reason: 'busy' };
    }
    const raised = await items.findOneAndUpdate({ _id: plan.target._id, guildId, userId, level: plan.target.level }, 
    // (Locked by it, but of a hero's gear only its T10.)
    { $set: { level: plan.to, ...((!heroOnly(item) || topTier(item)) && { locked: true }) } }, { returnDocument: 'after' });
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
async function refineWithStones(guildId, userId, item, target, cls, least, have, balance) {
    const { items, members } = collections();
    const from = refineLevel(target.level, least);
    if (from >= REFINE.maxLevel)
        return { ok: false, reason: 'maxed', level: from };
    const to = from + 1;
    const cost = refineCost(item.stars, to);
    const reclaimed = target.reclaimed === true;
    const need = tmStoneCost(to, reclaimed);
    const field = `stones.${cls}`;
    const charged = await members.findOneAndUpdate({ guildId, userId, points: { $gte: cost }, [field]: { $gte: need } }, { $inc: { points: -cost, [field]: -need } }, { returnDocument: 'after' });
    if (!charged) {
        const now = await members.findOne({ guildId, userId }, { projection: { points: 1, stones: 1 } });
        const stones = now?.stones?.[cls] ?? have;
        if (stones < need)
            return { ok: false, reason: 'no_stones', level: from, cls, need, have: stones };
        return { ok: false, reason: 'too_poor', level: from, price: cost, balance: now?.points ?? balance };
    }
    const raised = await items.findOneAndUpdate({ _id: target._id, guildId, userId, level: target.level }, { $set: { level: to, ...((!heroOnly(item) || topTier(item)) && { locked: true }) } }, { returnDocument: 'after' });
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
//# sourceMappingURL=refine.js.map