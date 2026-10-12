import { CONFIG } from '../../config.js';
import { collections } from '../../db.js';
import { raidWeek } from '../../lib/events/raid-week.js';
import { describeEffects } from '../../lib/game/items/equipment.js';
import { raidShopStock, refreshPrice, refreshesUsed } from '../../lib/game/items/raid-shop.js';
import { buyRaidItem, refreshRaidShop } from '../../services/raid-shop.js';
import type { Slot, Stars } from '../../types.js';

/*
 * The site's raid shop (GET /api/raid-shop, POST /api/raid-shop/buy and /refresh): the raid items on
 * the member's shelf this week (the server's, until they refresh it), what each costs in komaGems and
 * how many copies they have; buying one, and paying for a new shelf (services/raid-shop.ts). Effect
 * lines are the gear card's, as Discord shows them (the page draws the emoji and *italics*).
 */

/** One raid item on the shelf, as the site shows it. */
export interface RaidShopItem {
  /** The site draws it by this id (its public/gear/items). */
  id: string;
  name: string;
  stars: Stars;
  slot: Slot;
  description: string;
  /** What a new copy does (R1). */
  effects: string[];
  /** What a copy costs in komaGems. */
  price: number;
  /** How many copies of it the member has. */
  owned: number;
}

/** GET /api/raid-shop: this week's shelf, best tier first, and the member's komaGems. */
export interface RaidShopView {
  items: RaidShopItem[];
  gems: number;
  /** When the shelf changes (ms): the start of the next raid week. */
  resetsAt: number;
  /**
   * Paying for a new shelf: how many refreshes a week a member gets (`max`, 0 when it's off), how many
   * of this week's they have `left`, and what the next costs in komaGems (null with none left).
   */
  refresh: { max: number; left: number; price: number | null };
}

/** What the raid shop's routes use (the database's, unless a test says otherwise). */
export interface RaidShopStore {
  view: (guildId: string, userId: string) => Promise<RaidShopView>;
  /** Buys one copy of an item on the shelf: the shop after, or why not (nothing was spent). */
  buy: (guildId: string, userId: string, id: string) => Promise<RaidShopView | 'not_found' | 'too_poor'>;
  /** Pays for a new shelf: the shop after, or why not (nothing was spent). */
  refresh: (guildId: string, userId: string) => Promise<RaidShopView | 'no_refreshes' | 'too_poor' | 'busy'>;
}

async function raidShopView(guildId: string, userId: string, now: Date = new Date()): Promise<RaidShopView> {
  const week = raidWeek(now);
  const { members, items } = collections();
  const member = await members.findOne({ guildId, userId }, { projection: { gems: 1, raidShop: 1 } });
  const used = refreshesUsed(member?.raidShop, week.key);
  const stock = raidShopStock(guildId, week.key, CONFIG.raid.shop, { userId, refreshes: used });
  const copies = await items.find({ guildId, userId, itemId: { $in: stock.map((entry) => entry.item.id) } }, { projection: { itemId: 1 } }).toArray();
  const owned = new Map<string, number>();
  for (const copy of copies) owned.set(copy.itemId, (owned.get(copy.itemId) ?? 0) + 1);
  const max = Math.max(0, Math.floor(CONFIG.raid.shop.refreshes));
  return {
    items: stock.map(({ item, price }) => ({
      id: item.id,
      name: item.name,
      stars: item.stars,
      slot: item.slot,
      description: item.description,
      effects: describeEffects(item, 1, 1, false),
      price,
      owned: owned.get(item.id) ?? 0,
    })),
    gems: member?.gems ?? 0,
    resetsAt: week.next.getTime(),
    refresh: { max, left: Math.max(0, max - used), price: refreshPrice(used, CONFIG.raid.shop) },
  };
}

export const raidShopStore: RaidShopStore = {
  view: (guildId, userId) => raidShopView(guildId, userId),
  buy: async (guildId, userId, id) => {
    const result = await buyRaidItem(guildId, userId, id);
    return result.ok ? raidShopView(guildId, userId) : result.reason;
  },
  refresh: async (guildId, userId) => {
    const result = await refreshRaidShop(guildId, userId);
    return result.ok ? raidShopView(guildId, userId) : result.reason;
  },
};
