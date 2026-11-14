import { ApiError } from '../lib/errors.js';
import { raidShopStore } from '../models/raid-shop.js';
export function raidShopService(deps) {
    const store = deps.raidShop ?? raidShopStore;
    /** The shop as it stands after a change, or the change's error. */
    const answer = (result) => {
        if (typeof result === 'string')
            throw new ApiError(result);
        return result;
    };
    return {
        view: (guildId, userId) => store.view(guildId, userId),
        buy: async (guildId, userId, id) => answer(await store.buy(guildId, userId, id)),
        refresh: async (guildId, userId) => answer(await store.refresh(guildId, userId)),
        craft: async (guildId, userId, count, recipe) => answer(await store.craft(guildId, userId, count, recipe)),
        use: async (guildId, userId, of, pick) => answer(await store.use(guildId, userId, of, pick)),
    };
}
//# sourceMappingURL=raid-shop.js.map