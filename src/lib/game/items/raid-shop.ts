import { createHash } from 'node:crypto';
import type { Settings } from '../../../config.js';
import { RAID_SHOP_STARS } from '../../../constants/index.js';
import { RAID_DROPS } from '../../../data/items.js';
import type { ItemDef } from '../../../types.js';

/*
 * The raid shop (the site's shop, Raid Gear tab): raid-only items (ItemDef.raidDrop) sold for komaGems,
 * the currency a raid win pays. Only a few of each tier are on the shelf (raid.shop.stock.<stars>), each
 * at its tier's price (raid.shop.price.<stars>), and which ones changes with the raid's week
 * (lib/events/raid-week.ts): every server has its own shelf, the same for all its members, worked out
 * from the server and the week alone, so nothing is stored. A member can buy as many copies of what's
 * on it as they have komaGems for.
 *
 * A member can also pay komaGems to refresh the shelf (raid.shop.refreshes times a week): they get
 * another one, theirs alone, worked out from who they are and how many times they refreshed, which is
 * all that's kept (MemberDoc.raidShop). The first refresh of a week costs raid.shop.refreshCost, and
 * each one after it that much more than the one before. The database side is services/raid-shop.ts.
 */

/** One item on the shelf, and what a copy of it costs in komaGems. */
export interface RaidShopEntry {
  item: ItemDef;
  price: number;
}

type ShopSettings = Settings['raid']['shop'];

/** A member who refreshed their shelf this week, and how many times. */
export interface ShelfRefresh {
  userId: string;
  refreshes: number;
}

/** Where an item falls on a shelf (`shelf` names it): the same every time, and unrelated to any other item's. */
const shelfOrder = (shelf: string, itemId: string): string => createHash('sha256').update(`${shelf}:${itemId}`).digest('hex');

/** How many times a member refreshed their shelf in the week `weekKey`, from what's kept on them (another week's count is none). */
export const refreshesUsed = (kept: { week: string; refreshes: number } | null | undefined, weekKey: string): number =>
  kept && kept.week === weekKey ? Math.max(0, Math.floor(kept.refreshes)) : 0;

/** What a member's next refresh costs in komaGems when they've had `used` this week, or null when they have none left. */
export function refreshPrice(used: number, shop: Pick<ShopSettings, 'refreshCost' | 'refreshes'>): number | null {
  if (used >= Math.floor(shop.refreshes)) return null;
  return Math.max(0, Math.floor(shop.refreshCost)) * (used + 1);
}

/**
 * What a server's raid shop sells in the week `weekKey` (RaidWeek.key): the best tier first, each
 * tier's items in the catalog's order. A tier with fewer raid items than its shelf holds sells them all.
 * Changing how many a shelf holds mid-week only adds to (or takes from) what was there. With `own` (a
 * member who refreshed theirs at least once) it is that member's shelf after that many refreshes.
 */
export function raidShopStock(guildId: string, weekKey: string, shop: ShopSettings, own: ShelfRefresh | null = null, pool: readonly ItemDef[] = RAID_DROPS): RaidShopEntry[] {
  const shelf = own && own.refreshes > 0 ? `${guildId}:${weekKey}:${own.userId}:${own.refreshes}` : `${guildId}:${weekKey}`;
  return RAID_SHOP_STARS.flatMap((stars) => {
    const count = Math.max(0, Math.floor(shop.stock[stars] ?? 0));
    const price = Math.max(0, Math.floor(shop.price[stars] ?? 0));
    const picked = new Set(
      pool
        .filter((item) => item.stars === stars)
        .map((item) => ({ id: item.id, order: shelfOrder(shelf, item.id) }))
        .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0))
        .slice(0, count)
        .map((entry) => entry.id),
    );
    return pool.filter((item) => picked.has(item.id)).map((item) => ({ item, price }));
  });
}
