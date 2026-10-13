import type { ApiDeps } from '../api.js';
import { ApiError } from '../lib/errors.js';
import { gachaStore, type BannerResult, type BannerView } from '../models/gacha.js';
import type { BannerId } from '../../types.js';

/* The banner page: what a pull costs a member, and pulling (gacha.ts's store). */

export type GachaService = ReturnType<typeof gachaService>;

export function gachaService(deps: ApiDeps) {
  const store = deps.gacha ?? gachaStore;

  return {
    view: (guildId: string, userId: string, banner: BannerId): Promise<BannerView> => store.view(guildId, userId, banner),

    /** One pull, or a multi pull, on a banner. */
    async pull(guildId: string, userId: string, multi: boolean, banner: BannerId): Promise<BannerResult> {
      const result = await store.pull(guildId, userId, multi, banner);
      if (result === 'too_poor' || result === 'closed') throw new ApiError(result);
      return result;
    },

    /** Picks the item a banner's guarantee gives them (null: any of them). */
    async pick(guildId: string, userId: string, banner: BannerId, itemId: string | null): Promise<BannerView> {
      const result = await store.pick(guildId, userId, banner, itemId);
      if (result === 'not_found') throw new ApiError(result);
      return result;
    },
  };
}
