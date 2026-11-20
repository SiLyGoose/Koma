import type { ApiDeps } from '../api.js';
import { ApiError } from '../lib/errors.js';
import { heroOutfitStore, type HeroOutfitsView } from '../models/hero-outfits.js';

/* The site's hero outfits: which are the member's, buying one (the shop) and putting one on (a hero's outfit room) (hero-outfits.ts's store). */

export type HeroOutfitService = ReturnType<typeof heroOutfitService>;

export function heroOutfitService(deps: ApiDeps) {
  const store = deps.heroOutfits ?? heroOutfitStore;

  /** The outfits as they stand after a change, or the change's error. */
  const answer = (result: HeroOutfitsView | 'not_found' | 'not_owned' | 'owned' | 'too_poor'): HeroOutfitsView => {
    if (typeof result === 'string') throw new ApiError(result);
    return result;
  };

  return {
    view: (guildId: string, userId: string): Promise<HeroOutfitsView> => store.view(guildId, userId),
    buy: async (guildId: string, userId: string, id: string): Promise<HeroOutfitsView> => answer(await store.buy(guildId, userId, id)),
    wear: async (guildId: string, userId: string, hero: string, id: string | null): Promise<HeroOutfitsView> => answer(await store.wear(guildId, userId, hero, id)),
  };
}
