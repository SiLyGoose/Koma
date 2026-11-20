import type { ApiDeps } from '../api.js';
import { ApiError } from '../lib/errors.js';
import { tmBatchStore, type TmBatchesView, type TmBatchStart } from '../models/tm-batches.js';

/* The raid page's background raids: their batch, starting one and stopping it (tm-batches.ts's store). */

export type TmBatchService = ReturnType<typeof tmBatchService>;

export function tmBatchService(deps: ApiDeps) {
  const store = deps.tmBatches ?? tmBatchStore;

  /** The view after a change, or the change's error. */
  const answer = (result: TmBatchesView | string): TmBatchesView => {
    if (typeof result === 'string') throw new ApiError(result as ConstructorParameters<typeof ApiError>[0]);
    return result;
  };

  return {
    view: (guildId: string, userId: string): Promise<TmBatchesView> => store.view(guildId, userId),
    start: async (guildId: string, userId: string, ask: TmBatchStart): Promise<TmBatchesView> => answer(await store.start(guildId, userId, ask)),
    stop: async (guildId: string, userId: string): Promise<TmBatchesView> => answer(await store.stop(guildId, userId)),
  };
}
