import { ApiError } from '../lib/errors.js';
import { heroStore } from '../models/heroes.js';
import { breakSocketedRune, craftRunes, sellRunes } from '../../services/runes.js';
export function runeService(deps) {
    const view = deps.heroes?.view ?? heroStore.view;
    /** What a change came to, or its error. */
    const answer = (result) => {
        if (!result.ok)
            throw new ApiError(result.reason);
        return result.value;
    };
    return {
        /** Sells (or, `disassemble`, breaks into Rune Fragments) as many of each of their runes as `runes` says. */
        async sell(guildId, userId, runes, disassemble) {
            const runeSale = answer(await sellRunes(guildId, userId, runes, disassemble));
            return { ...(await view(guildId, userId)), runeSale };
        },
        /** Crafts `count` of a Mysterious Rune from their Rune Fragments. */
        async craft(guildId, userId, box, count) {
            const crafted = answer(await craftRunes(guildId, userId, box, count));
            return { ...(await view(guildId, userId)), crafted };
        },
        /** Disassembles the rune in one of their copies' sockets where it is. */
        async break(guildId, userId, copy, socket) {
            const fragments = answer(await breakSocketedRune(guildId, userId, copy, socket));
            return { ...(await view(guildId, userId)), fragments };
        },
    };
}
//# sourceMappingURL=runes.js.map