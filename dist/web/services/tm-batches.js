import { ApiError } from '../lib/errors.js';
import { tmBatchStore } from '../models/tm-batches.js';
export function tmBatchService(deps) {
    const store = deps.tmBatches ?? tmBatchStore;
    /** The view after a change, or the change's error. */
    const answer = (result) => {
        if (typeof result === 'string')
            throw new ApiError(result);
        return result;
    };
    return {
        view: (guildId, userId) => store.view(guildId, userId),
        start: async (guildId, userId, ask) => answer(await store.start(guildId, userId, ask)),
        stop: async (guildId, userId) => answer(await store.stop(guildId, userId)),
    };
}
//# sourceMappingURL=tm-batches.js.map