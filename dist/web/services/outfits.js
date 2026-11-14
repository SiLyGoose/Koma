import { ApiError } from '../lib/errors.js';
import { outfitStore } from '../models/outfits.js';
export function outfitService(deps) {
    const store = deps.outfits ?? outfitStore;
    /** The outfits as they stand after a change, or the change's error. */
    const answer = (result) => {
        if (typeof result === 'string')
            throw new ApiError(result);
        return result;
    };
    return {
        view: (guildId, userId) => store.view(guildId, userId),
        buy: async (guildId, userId, id) => answer(await store.buy(guildId, userId, id)),
        wear: async (guildId, userId, id) => answer(await store.wear(guildId, userId, id)),
    };
}
//# sourceMappingURL=outfits.js.map