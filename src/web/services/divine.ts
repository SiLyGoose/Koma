import type { ApiDeps } from '../api.js';
import { ApiError } from '../lib/errors.js';
import { divineStore } from '../models/divine.js';
import type { BlasphemyBroken, BlasphemyCrafted, DivineArtifactCrafted, DivineError, DivineGroupId, DivineTicketUsed, DivineView, DpFragment, VoidSocket } from '../../protocol/divine.js';
import type { SelectorPick } from '../../services/mail.js';

/* The Divine Punishment Raid's page (/api/divine): its store's (models/divine.ts), each answering the view after, or an ApiError. */

export type DivineService = ReturnType<typeof divineService>;

export function divineService(deps: ApiDeps) {
  const store = deps.divine ?? divineStore;

  /** The view after a change, or its error. */
  const answer = <T>(result: T | DivineError): T => {
    if (typeof result === 'string') throw new ApiError(result as DivineError);
    return result;
  };

  return {
    view: (guildId: string, userId: string): Promise<DivineView> => store.view(guildId, userId),
    open: async (guildId: string, userId: string, group: DivineGroupId, type: 'boss' | 'karma', level?: number): Promise<DivineView> => answer(await store.open(guildId, userId, group, type, level)),
    reset: async (guildId: string, userId: string, group: DivineGroupId): Promise<DivineView> => answer(await store.reset(guildId, userId, group)),
    buyVoid: async (guildId: string, userId: string, socket: VoidSocket, count: number): Promise<DivineView> => answer(await store.buyVoid(guildId, userId, socket, count)),
    async artifact(guildId: string, userId: string, fragment: DpFragment): Promise<DivineArtifactCrafted> {
      const { view, crafted } = answer(await store.artifact(guildId, userId, fragment));
      return { ...view, crafted };
    },
    async ticket(guildId: string, userId: string, of: 'uw' | 'ut', pick: SelectorPick): Promise<DivineTicketUsed> {
      const { view, given } = answer(await store.ticket(guildId, userId, of, pick));
      return { ...view, given };
    },
    async craft(guildId: string, userId: string, rune: string, ingredients: Record<string, number>): Promise<BlasphemyCrafted> {
      const { view, crafted } = answer(await store.craft(guildId, userId, rune, ingredients));
      return { ...view, crafted };
    },
    async breakRune(guildId: string, userId: string, what: { id: string } | { copy: string; socket: number }): Promise<BlasphemyBroken> {
      const { view, fragments } = answer('id' in what ? await store.breakStored(guildId, userId, what.id) : await store.breakSocketed(guildId, userId, what.copy, what.socket));
      return { ...view, gained: fragments };
    },
    extend: async (guildId: string, userId: string): Promise<DivineView> => answer(await store.extend(guildId, userId)),
    socket: async (guildId: string, userId: string, copy: string, socket: number, id: string): Promise<DivineView> => answer(await store.socket(guildId, userId, copy, socket, id)),
    unsocket: async (guildId: string, userId: string, copy: string, socket: number): Promise<DivineView> => answer(await store.unsocket(guildId, userId, copy, socket)),
  };
}
