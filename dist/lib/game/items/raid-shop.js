import { createHash } from 'node:crypto';
import { RAID_SHOP_STARS } from '../../../constants/index.js';
import { RAID_DROPS } from '../../../data/items.js';
/** Whether the raid shop sells `item` at all: a raid item of a tier it has a shelf for (which weeks it's on a shelf is raidShopStock's). */
export const soldInRaidShop = (item, shop) => item.raidDrop === true && RAID_SHOP_STARS.some((stars) => stars === item.stars && Math.floor(shop.stock[stars] ?? 0) > 0);
/** What a copy of `item` costs in the raid shop, in komaGems (0 for one it doesn't sell). */
export function raidShopPrice(item, shop) {
    const stars = RAID_SHOP_STARS.find((tier) => tier === item.stars);
    return stars !== undefined && soldInRaidShop(item, shop) ? Math.max(0, Math.floor(shop.price[stars] ?? 0)) : 0;
}
/** Where an item falls on a shelf (`shelf` names it): the same every time, and unrelated to any other item's. */
const shelfOrder = (shelf, itemId) => createHash('sha256').update(`${shelf}:${itemId}`).digest('hex');
/** How many times a member refreshed their shelf in the week `weekKey`, from what's kept on them (another week's count is none). */
export const refreshesUsed = (kept, weekKey) => kept && kept.week === weekKey ? Math.max(0, Math.floor(kept.refreshes)) : 0;
/** What a member's next refresh costs in komaGems when they've had `used` this week, or null when they have none left. */
export function refreshPrice(used, shop) {
    if (used >= Math.floor(shop.refreshes))
        return null;
    return Math.max(0, Math.floor(shop.refreshCost)) * (used + 1);
}
/**
 * What a server's raid shop sells in the week `weekKey` (RaidWeek.key): the best tier first, each
 * tier's items in the catalog's order. A tier with fewer raid items than its shelf holds sells them all.
 * Changing how many a shelf holds mid-week only adds to (or takes from) what was there. With `own` (a
 * member who refreshed theirs at least once) it is that member's shelf after that many refreshes.
 */
export function raidShopStock(guildId, weekKey, shop, own = null, pool = RAID_DROPS) {
    const shelf = own && own.refreshes > 0 ? `${guildId}:${weekKey}:${own.userId}:${own.refreshes}` : `${guildId}:${weekKey}`;
    return RAID_SHOP_STARS.flatMap((stars) => {
        const count = Math.max(0, Math.floor(shop.stock[stars] ?? 0));
        const price = Math.max(0, Math.floor(shop.price[stars] ?? 0));
        const picked = new Set(pool
            .filter((item) => item.stars === stars)
            .map((item) => ({ id: item.id, order: shelfOrder(shelf, item.id) }))
            .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0))
            .slice(0, count)
            .map((entry) => entry.id));
        return pool.filter((item) => picked.has(item.id)).map((item) => ({ item, price }));
    });
}
//# sourceMappingURL=raid-shop.js.map