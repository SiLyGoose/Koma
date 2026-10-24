import type { ApiDeps } from '../api.js';
import { ApiError } from '../lib/errors.js';
import { heroStore } from '../models/heroes.js';
import { breakSocketedRune, craftRunes, sellRunes, type RuneResult } from '../../services/runes.js';
import type { RuneBoxId, RuneBroken, RunesCrafted, RunesSold } from '../../protocol/runes.js';

/*
 * The member's runes beyond their sockets (/api/runes): selling or disassembling them, crafting Mysterious Runes from Rune
 * Fragments, and disassembling one in a socket (services/runes.ts). Each answers their heroes after (the heroes page's and
 * the Inventory's view), with what it came to.
 */

export type RuneService = ReturnType<typeof runeService>;

export function runeService(deps: ApiDeps) {
  const view = deps.heroes?.view ?? heroStore.view;

  /** What a change came to, or its error. */
  const answer = <T>(result: RuneResult<T>): T => {
    if (!result.ok) throw new ApiError(result.reason);
    return result.value;
  };

  return {
    /** Sells (or, `disassemble`, breaks into Rune Fragments) as many of each of their runes as `runes` says. */
    async sell(guildId: string, userId: string, runes: Record<string, number>, disassemble: boolean): Promise<RunesSold> {
      const runeSale = answer(await sellRunes(guildId, userId, runes, disassemble));
      return { ...(await view(guildId, userId)), runeSale };
    },

    /** Crafts `count` of a Mysterious Rune from their Rune Fragments. */
    async craft(guildId: string, userId: string, box: RuneBoxId, count: number): Promise<RunesCrafted> {
      const crafted = answer(await craftRunes(guildId, userId, box, count));
      return { ...(await view(guildId, userId)), crafted };
    },

    /** Disassembles the rune in one of their copies' sockets where it is. */
    async break(guildId: string, userId: string, copy: string, socket: number): Promise<RuneBroken> {
      const fragments = answer(await breakSocketedRune(guildId, userId, copy, socket));
      return { ...(await view(guildId, userId)), fragments };
    },
  };
}
