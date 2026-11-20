import type { ApiDeps } from '../api.js';
import { ApiError } from '../lib/errors.js';
import { outfitStore, type OutfitsView } from '../models/outfits.js';

/* The site's outfits: which are the member's, buying one (the shop) and putting one on (the dressing room) (outfits.ts's store). */

export type OutfitService = ReturnType<typeof outfitService>;

export function outfitService(deps: ApiDeps) {
  const store = deps.outfits ?? outfitStore;

  /** The outfits as they stand after a change, or the change's error. */
  const answer = (result: OutfitsView | 'not_found' | 'owned' | 'too_poor' | 'not_owned'): OutfitsView => {
    if (typeof result === 'string') throw new ApiError(result);
    return result;
  };

  return {
    view: (guildId: string, userId: string): Promise<OutfitsView> => store.view(guildId, userId),
    buy: async (guildId: string, userId: string, id: string): Promise<OutfitsView> => answer(await store.buy(guildId, userId, id)),
    wear: async (guildId: string, userId: string, id: string): Promise<OutfitsView> => answer(await store.wear(guildId, userId, id)),
  };
}
