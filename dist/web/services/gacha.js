import { ApiError } from '../lib/errors.js';
import { gachaStore } from '../models/gacha.js';
export function gachaService(deps) {
    const store = deps.gacha ?? gachaStore;
    return {
        view: (guildId, userId, banner) => store.view(guildId, userId, banner),
        /** A page of their pulls on a banner, the newest first. */
        history: (guildId, userId, banner, page) => store.history(guildId, userId, banner, page),
        /** One pull, or a multi pull, on a banner. */
        async pull(guildId, userId, multi, banner) {
            const result = await store.pull(guildId, userId, multi, banner);
            if (result === 'too_poor' || result === 'closed')
                throw new ApiError(result);
            return result;
        },
        /** Picks the item a banner's guarantee gives them (null: any of them). */
        async pick(guildId, userId, banner, itemId) {
            const result = await store.pick(guildId, userId, banner, itemId);
            if (result === 'not_found')
                throw new ApiError(result);
            return result;
        },
    };
}
//# sourceMappingURL=gacha.js.map