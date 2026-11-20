import { CONFIG } from '../../../config.js';
import { ITEMS } from '../../../data/items.js';
import { KR_ITEMS } from '../../../data/kr-gear.js';
import { heroOnly } from '../heroes.js';
import { SLOTS, STARS } from '../../../types.js';
/**
 * Reads the words after `sell`:
 *   `<item>`          one copy
 *   `<n> <item>`      that many copies (`1 <item>` is the same as `<item>`)
 *   `all <item>`      every copy that isn't worn
 *   `stars <1-4>`     every unworn item of a star tier (`star` works too)
 */
export function parseSellArgs(args) {
    const words = args.map((word) => word.trim()).filter((word) => word !== '');
    if (words.length === 0)
        return { ok: false, error: 'usage' };
    const first = words[0].toLowerCase();
    if (first === 'all') {
        const query = words.slice(1).join(' ');
        return query === '' ? { ok: false, error: 'missing_item' } : { ok: true, request: { kind: 'allOf', query } };
    }
    if (first === 'tier' || first === 'stars' || first === 'star') {
        const wanted = words[1];
        if (words.length !== 2 || wanted === undefined || !/^\d+$/.test(wanted))
            return { ok: false, error: 'bad_stars' };
        const stars = Number(wanted);
        if (!STARS.includes(stars))
            return { ok: false, error: 'bad_stars' };
        return { ok: true, request: { kind: 'stars', stars: stars } };
    }
    // A whole number first, then the item: that many copies.
    if (/^\d+$/.test(first)) {
        const query = words.slice(1).join(' ');
        if (query === '')
            return { ok: false, error: 'missing_item' };
        const amount = Number(first);
        if (!(amount >= 1))
            return { ok: false, error: 'bad_amount' };
        return { ok: true, request: amount === 1 ? { kind: 'one', query } : { kind: 'some', amount, query } };
    }
    return { ok: true, request: { kind: 'one', query: words.join(' ') } };
}
/** The ids of the copies a member is wearing (their weapon, armor and unique treasure slots). */
export function equippedCopyIds(equipment) {
    const ids = new Set();
    for (const slot of SLOTS) {
        const id = equipment?.[slot];
        if (typeof id === 'string' && id !== '')
            ids.add(id);
    }
    return ids;
}
/** Orders copies the way they are sold: the one to sell first comes first (see `worstCopy`). */
function sellsBefore(a, b) {
    if (a.level !== b.level)
        return a.level - b.level;
    if (a.obtainedAt.getTime() !== b.obtainedAt.getTime())
        return b.obtainedAt.getTime() - a.obtainedAt.getTime();
    return a._id < b._id ? 1 : a._id > b._id ? -1 : 0;
}
/** The `count` copies to sell first, in the order they would be sold (each pick is what `worstCopy` would choose). */
export function worstCopies(copies, count) {
    return [...copies].sort(sellsBefore).slice(0, Math.max(0, count));
}
/**
 * The copy to sell when selling just one: the lowest level, then the one obtained most recently (the opposite of the copy that gets equipped), then
 * the highest id so the choice never varies.
 */
export function worstCopy(copies) {
    let worst;
    for (const copy of copies)
        if (!worst || sellsBefore(copy, worst) < 0)
            worst = copy;
    return worst;
}
/** What one item of a star tier sells for, from the live settings. */
export function sellPrice(stars) {
    return CONFIG.sell.price[stars];
}
/** The points one copy of an item sells for: its star tier's, but hero gear (4★) a T1's. */
export const itemSellPrice = (item) => sellPrice(heroOnly(item) ? 1 : item.stars);
/** What one copy of an item sells for: its points (itemSellPrice). */
export const itemWorth = (item) => ({ unit: 'points', each: itemSellPrice(item) });
/** What salvaging one copy gives: hero gear its komaDust (itemSalvage); anything else can't be salvaged, so nothing. */
export const salvageWorth = (item) => ({ unit: 'powder', each: itemSalvage(item) });
/**
 * The komaDust salvaging one copy of hero gear gives (anything else: none): a King's Raid piece by its tier (the dragon sets' 6
 * to 8, the TechnoMagic sets' 9, an artifact's 10), the old TechnoMagic gear its own, a unique weapon or treasure its own. A
 * TechnoMagic set's piece gives its class's Upgrade Stones and its set's Boss Crystals too (constants/technomagic.ts tmSalvageStones).
 */
export function itemSalvage(item) {
    if (!heroOnly(item))
        return 0;
    const powder = CONFIG.sell.powder;
    if (item.kr)
        return Math.max(0, Math.floor(powder[String(item.kr.tier)] ?? 0));
    return Math.max(0, Math.floor(item.tmDrop ? powder.technomagic : powder.unique));
}
/** Every item a sale can price: the catalog's and King's Raid's hero gear. */
const SOLD = [...ITEMS, ...KR_ITEMS];
/**
 * Groups item ids into sale lines: highest star tier first, and in catalog order within a tier.
 * Ids that aren't in the catalog are left out (their star tier, so their price, is unknown).
 */
export function saleLines(itemIds, catalog = SOLD, worth = itemWorth) {
    const counts = new Map();
    for (const id of itemIds)
        counts.set(id, (counts.get(id) ?? 0) + 1);
    const lines = [];
    for (const item of catalog) {
        const count = counts.get(item.id);
        if (!count)
            continue;
        const { unit, each } = worth(item);
        lines.push({ item, count, unit, each, total: each * count });
    }
    return lines.sort((a, b) => b.item.stars - a.item.stars);
}
/** What a sale's lines pay in points, and in komaDust. */
export const saleTotal = (lines) => lines.reduce((sum, line) => sum + (line.unit === 'points' ? line.total : 0), 0);
export const salePowder = (lines) => lines.reduce((sum, line) => sum + (line.unit === 'powder' ? line.total : 0), 0);
export const saleCount = (lines) => lines.reduce((sum, line) => sum + line.count, 0);
//# sourceMappingURL=sell.js.map