import { collections } from '../../db.js';
import { ITEMS_BY_ID } from '../../data/items.js';
import { heroOnly } from '../../lib/game/heroes.js';
import { tmSalvageCrystals, tmSalvageStones } from '../../constants/technomagic.js';
import { tmStoneClass } from '../../data/kr-gear.js';
import { itemWorth, saleCount, saleLines, salePowder, saleTotal, salvageWorth, worstCopies, worstCopy } from '../../lib/game/items/sell.js';
import { keptCopyIds } from '../../lib/game/items/loadouts.js';
import { ensureMember } from '../economy/index.js';
/** Works out what selling `target` would sell and earn, without changing anything. */
export async function planSale(guildId, userId, target) {
    const { items, members } = collections();
    const [copies, member] = await Promise.all([items.find({ guildId, userId }).toArray(), members.findOne({ guildId, userId })]);
    const worn = keptCopyIds(member);
    const inScope = copies.filter((copy) => {
        const item = ITEMS_BY_ID.get(copy.itemId);
        if (!item)
            return false;
        return target.kind === 'stars' ? item.stars === target.stars && !heroOnly(item) : item.id === target.item.id;
    });
    if (inScope.length === 0)
        return { ok: false, reason: 'not_owned' };
    const sellable = inScope.filter((copy) => !worn.has(copy._id) && !copy.locked);
    if (sellable.length === 0)
        return { ok: false, reason: inScope.some((copy) => copy.locked) ? 'only_locked' : 'only_equipped' };
    if (target.kind === 'some' && sellable.length < target.amount)
        return { ok: false, reason: 'not_enough', available: sellable.length };
    const chosen = target.kind === 'one' ? [worstCopy(sellable)] : target.kind === 'some' ? worstCopies(sellable, target.amount) : sellable;
    const lines = saleLines(chosen.map((copy) => copy.itemId));
    return { ok: true, copyIds: chosen.map((copy) => copy._id), lines, count: saleCount(lines), total: saleTotal(lines), powder: salePowder(lines) };
}
/**
 * Sells these copies. Each one is only sold if it is still owned by the member and is not worn
 * or locked right now (`locked`: locked ones too, the heroes page's sale that says so), so a sale can never take gear they put on after it was planned. Points (and komaDust) are paid for
 * exactly the copies that were removed, so two sales of the same copies at once pay only once. `salvage`: salvaged for komaDust instead,
 * only the hero gear among them (anything else is kept).
 */
export async function sellCopies(guildId, userId, copyIds, { locked = false, salvage = false } = {}) {
    const { items, members, ledger } = collections();
    await ensureMember(guildId, userId);
    const member = await members.findOne({ guildId, userId });
    const worn = keptCopyIds(member);
    const candidates = (await items.find({ guildId, userId, _id: { $in: [...copyIds] } }).toArray()).filter((copy) => {
        const item = ITEMS_BY_ID.get(copy.itemId);
        return !worn.has(copy._id) && (locked || !copy.locked) && item !== undefined && (!salvage || heroOnly(item));
    });
    // Remove the copies one item at a time, so we know exactly how many of each were really removed.
    const byItem = new Map();
    for (const copy of candidates)
        byItem.set(copy.itemId, [...(byItem.get(copy.itemId) ?? []), copy]);
    const removedDocs = [];
    let allRemoved = true;
    for (const [, group] of byItem) {
        const result = await items.deleteMany({ guildId, userId, _id: { $in: group.map((copy) => copy._id) }, ...(locked ? {} : { locked: { $ne: true } }) });
        if (result.deletedCount < group.length)
            allRemoved = false; // another sale removed (or a lock kept) some of these at the same moment
        // Every copy in a group is of the same item, so only how many we removed matters for the pay.
        removedDocs.push(...group.slice(0, result.deletedCount));
    }
    const lines = saleLines(removedDocs.map((copy) => copy.itemId), undefined, salvage ? salvageWorth : itemWorth);
    const earned = saleTotal(lines);
    const powder = salePowder(lines);
    if (removedDocs.length === 0)
        return { ok: false, reason: 'nothing_to_sell' };
    // (A salvage's TechnoMagic pieces: their class's Upgrade Stones too, more for a Reclaimed one.)
    const stones = {};
    const crystals = {};
    if (salvage)
        for (const copy of removedDocs) {
            const item = ITEMS_BY_ID.get(copy.itemId);
            const cls = tmStoneClass(item ?? { kr: undefined });
            const set = cls ? item?.kr?.set : undefined;
            if (cls)
                stones[cls] = (stones[cls] ?? 0) + tmSalvageStones(copy.reclaimed === true);
            if (set)
                crystals[set] = (crystals[set] ?? 0) + tmSalvageCrystals(copy.reclaimed === true);
        }
    let balance;
    let powderBalance;
    try {
        const inc = { ...(earned > 0 && { points: earned }), ...(powder > 0 && { powder }), ...Object.fromEntries(Object.entries(stones).map(([cls, count]) => [`stones.${cls}`, count])), ...Object.fromEntries(Object.entries(crystals).map(([set, count]) => [`crystals.${set}`, count])) };
        const updated = Object.keys(inc).length > 0 ? await members.findOneAndUpdate({ guildId, userId }, { $inc: inc }, { returnDocument: 'after' }) : await members.findOne({ guildId, userId });
        balance = updated?.points ?? earned;
        powderBalance = updated?.powder ?? powder;
    }
    catch (err) {
        // Could not pay, so give the copies back (only when we know nobody else touched them).
        if (allRemoved) {
            try {
                await items.insertMany(removedDocs);
            }
            catch (restoreErr) {
                console.error('Could not give back the copies of a failed sale:', restoreErr);
            }
        }
        else {
            console.error('A sale failed to pay out while another sale was running; some copies were not restored.');
        }
        throw err;
    }
    const entries = lines
        .filter((line) => line.total > 0)
        .map((line) => ({ guildId, userId, ...(line.unit === 'powder' ? { delta: 0, powderDelta: line.total } : { delta: line.total }), reason: salvage ? 'salvage' : 'sell', itemId: line.item.id, createdAt: new Date() }));
    if (entries.length > 0) {
        try {
            await ledger.insertMany(entries);
        }
        catch (err) {
            console.error('Failed to write ledger entries:', err);
        }
    }
    return { ok: true, lines, earned, powder, stones, crystals, balance, powderBalance, skipped: copyIds.length - removedDocs.length };
}
//# sourceMappingURL=sell.js.map