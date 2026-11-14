import { ApiError } from '../lib/errors.js';
import { heroOutfitStore } from '../models/hero-outfits.js';
export function heroOutfitService(deps) {
    const store = deps.heroOutfits ?? heroOutfitStore;
    /** The outfits as they stand after a change, or the change's error. */
    const answer = (result) => {
        if (typeof result === 'string')
            throw new ApiError(result);
        return result;
    };
    return {
        view: (guildId, userId) => store.view(guildId, userId),
        buy: async (guildId, userId, id) => answer(await store.buy(guildId, userId, id)),
        wear: async (guildId, userId, hero, id) => answer(await store.wear(guildId, userId, hero, id)),
    };
}
//# sourceMappingURL=hero-outfits.js.map