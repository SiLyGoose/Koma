import { ApiError } from '../lib/errors.js';
import { divineStore } from '../models/divine.js';
export function divineService(deps) {
    const store = deps.divine ?? divineStore;
    /** The view after a change, or its error. */
    const answer = (result) => {
        if (typeof result === 'string')
            throw new ApiError(result);
        return result;
    };
    return {
        view: (guildId, userId) => store.view(guildId, userId),
        rewards: async (guildId, userId, group, level) => answer(await store.rewards(guildId, userId, group, level)),
        open: async (guildId, userId, group, type, level) => answer(await store.open(guildId, userId, group, type, level)),
        reset: async (guildId, userId, group) => answer(await store.reset(guildId, userId, group)),
        buyVoid: async (guildId, userId, socket, count) => answer(await store.buyVoid(guildId, userId, socket, count)),
        async artifact(guildId, userId, fragment) {
            const { view, crafted } = answer(await store.artifact(guildId, userId, fragment));
            return { ...view, crafted };
        },
        async ticket(guildId, userId, of, pick) {
            const { view, given } = answer(await store.ticket(guildId, userId, of, pick));
            return { ...view, given };
        },
        async craft(guildId, userId, rune, ingredients) {
            const { view, crafted } = answer(await store.craft(guildId, userId, rune, ingredients));
            return { ...view, crafted };
        },
        async breakRune(guildId, userId, what) {
            const { view, fragments } = answer('id' in what ? await store.breakStored(guildId, userId, what.id) : await store.breakSocketed(guildId, userId, what.copy, what.socket));
            return { ...view, gained: fragments };
        },
        extend: async (guildId, userId) => answer(await store.extend(guildId, userId)),
        socket: async (guildId, userId, copy, socket, id) => answer(await store.socket(guildId, userId, copy, socket, id)),
        unsocket: async (guildId, userId, copy, socket) => answer(await store.unsocket(guildId, userId, copy, socket)),
    };
}
//# sourceMappingURL=divine.js.map