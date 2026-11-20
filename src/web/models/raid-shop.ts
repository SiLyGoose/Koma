import { CONFIG } from '../../config.js';
import { collections } from '../../db.js';
import { raidWeek } from '../../lib/events/raid-week.js';
import { describeEffects } from '../../lib/game/items/equipment.js';
import { raidShopStock, refreshPrice, refreshesUsed } from '../../lib/game/items/raid-shop.js';
import { buyRaidItem, refreshRaidShop } from '../../services/raid-shop.js';
import { craftGems, craftSelectors, heldSelectors, useSelector, type SelectorKind } from '../../services/economy/powder.js';
import type { SelectorPick } from '../../services/mail.js';
import type { CraftRecipe, RaidShopItem, RaidShopUsed, RaidShopView } from '../../protocol/raid-shop.js';

export type { CraftRecipe, RaidShopItem, RaidShopUsed, RaidShopView };

/*
 * The site's raid shop (GET /api/raid-shop, POST /api/raid-shop/buy, /refresh, /craft and /use): the raid items on
 * the member's shelf this week (the server's, until they refresh it), what each costs in komaGems and
 * how many copies they have; buying one, and paying for a new shelf (services/raid-shop.ts); crafting komaGems or
 * tickets from komaDust, and using a ticket (services/economy/powder.ts). Effect
 * lines are the gear card's, as Discord shows them (the page draws the emoji and *italics*).
 */

/** What the raid shop's routes use (the database's, unless a test says otherwise). */
export interface RaidShopStore {
  view: (guildId: string, userId: string) => Promise<RaidShopView>;
  /** Buys one copy of an item on the shelf: the shop after, or why not (nothing was spent). */
  buy: (guildId: string, userId: string, id: string) => Promise<RaidShopView | 'not_found' | 'too_poor'>;
  /** Pays for a new shelf: the shop after, or why not (nothing was spent). */
  refresh: (guildId: string, userId: string) => Promise<RaidShopView | 'no_refreshes' | 'too_poor' | 'busy'>;
  /** Crafts `count` of `recipe` (komaGems, or tickets) from their komaDust: the shop after, or why not (nothing was spent). */
  craft: (guildId: string, userId: string, count: number, recipe: CraftRecipe) => Promise<RaidShopView | 'too_poor' | 'bad_request'>;
  /** Uses one of their tickets of kind `of` for the unique weapon or treasure `pick` is: the shop after and what it gave, or why not. */
  use: (guildId: string, userId: string, of: SelectorKind, pick: SelectorPick) => Promise<RaidShopUsed | 'bad_pick' | 'not_owned'>;
}

async function raidShopView(guildId: string, userId: string, now: Date = new Date()): Promise<RaidShopView> {
  const week = raidWeek(now);
  const { members, items } = collections();
  const member = await members.findOne({ guildId, userId }, { projection: { gems: 1, powder: 1, selectors: 1, raidShop: 1 } });
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
      effects: describeEffects(item, 1, 1),
      price,
      owned: owned.get(item.id) ?? 0,
    })),
    gems: member?.gems ?? 0,
    powder: member?.powder ?? 0,
    powderPerGem: Math.max(1, Math.floor(CONFIG.sell.powderPerGem)),
    powderPerSelector: Math.max(1, Math.floor(CONFIG.sell.powderPerSelector)),
    selectors: heldSelectors(member?.selectors),
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
  craft: async (guildId, userId, count, recipe) => {
    const result = recipe === 'gem' ? await craftGems(guildId, userId, count) : await craftSelectors(guildId, userId, recipe, count);
    return result.ok ? raidShopView(guildId, userId) : result.reason === 'bad_count' ? 'bad_request' : result.reason;
  },
  use: async (guildId, userId, of, pick) => {
    const result = await useSelector(guildId, userId, of, pick);
    return result.ok ? { ...(await raidShopView(guildId, userId)), given: result.given } : result.reason;
  },
};
