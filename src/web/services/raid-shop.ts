import type { ApiDeps } from '../api.js';
import { ApiError } from '../lib/errors.js';
import { raidShopStore, type CraftRecipe, type RaidShopUsed, type RaidShopView } from '../models/raid-shop.js';
import type { SelectorKind } from '../../services/economy/powder.js';
import type { SelectorPick } from '../../services/mail.js';

/* The site's raid shop: the member's shelf of raid items this week, buying one with komaGems, paying for a new shelf, crafting komaGems or tickets from komaDust, and using a ticket (raid-shop.ts's store). */

export type RaidShopService = ReturnType<typeof raidShopService>;

export function raidShopService(deps: ApiDeps) {
  const store = deps.raidShop ?? raidShopStore;

  /** The shop as it stands after a change, or the change's error. */
  const answer = <T extends RaidShopView>(result: T | 'not_found' | 'too_poor' | 'no_refreshes' | 'busy' | 'bad_request' | 'bad_pick' | 'not_owned'): T => {
    if (typeof result === 'string') throw new ApiError(result);
    return result;
  };

  return {
    view: (guildId: string, userId: string): Promise<RaidShopView> => store.view(guildId, userId),
    buy: async (guildId: string, userId: string, id: string): Promise<RaidShopView> => answer(await store.buy(guildId, userId, id)),
    refresh: async (guildId: string, userId: string): Promise<RaidShopView> => answer(await store.refresh(guildId, userId)),
    craft: async (guildId: string, userId: string, count: number, recipe: CraftRecipe): Promise<RaidShopView> => answer(await store.craft(guildId, userId, count, recipe)),
    use: async (guildId: string, userId: string, of: SelectorKind, pick: SelectorPick): Promise<RaidShopUsed> => answer(await store.use(guildId, userId, of, pick)),
  };
}
