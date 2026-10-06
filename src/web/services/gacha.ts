import type { ApiDeps } from '../api.js';
import { ApiError } from '../lib/errors.js';
import { gachaStore, type BannerResult, type BannerView } from '../models/gacha.js';

/* The banner page: what a pull costs a member, and pulling (gacha.ts's store). */

export type GachaService = ReturnType<typeof gachaService>;

export function gachaService(deps: ApiDeps) {
  const store = deps.gacha ?? gachaStore;

  return {
    view: (guildId: string, userId: string): Promise<BannerView> => store.view(guildId, userId),

    /** One pull, or a multi pull. */
    async pull(guildId: string, userId: string, multi: boolean): Promise<BannerResult> {
      const result = await store.pull(guildId, userId, multi);
      if (result === 'too_poor') throw new ApiError(result);
      return result;
    },
  };
}
