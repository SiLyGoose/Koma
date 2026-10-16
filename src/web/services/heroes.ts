import type { ApiDeps } from '../api.js';
import { avatarUrl, type Session } from '../auth/login.js';
import { ApiError } from '../lib/errors.js';
import { heroStore, type HeroesView } from '../models/heroes.js';
import type { HeroSlot } from '../../types.js';
import type { HeroMembers } from '../../protocol/heroes.js';

export type { HeroMembers };

/*
 * The TechnoMagic Raid's heroes: which are the member's, buying one (the shop) and gearing them (the heroes
 * page, transcending them and their perks) (heroes.ts's store), and who else in the server has heroes to look at.
 */

/** How many members the list has at most. */
const HERO_MEMBERS = 50;

export type HeroService = ReturnType<typeof heroService>;

export function heroService(deps: ApiDeps) {
  const store = deps.heroes ?? heroStore;

  /** The heroes as they stand after a change, or the change's error. */
  const answer = (result: HeroesView | 'not_found' | 'owned' | 'too_poor' | 'not_owned' | 'wrong_slot' | 'wrong_hero' | 'one_unique' | 'busy' | 'perk_locked' | 'too_many_points' | 'maxed'): HeroesView => {
    if (typeof result === 'string') throw new ApiError(result);
    return result;
  };

  return {
    view: (guildId: string, userId: string): Promise<HeroesView> => store.view(guildId, userId),

    /** Someone else's heroes, to look at: only while they're in the server, and not their points, komaGems or essences. */
    async peek(guildId: string, userId: string): Promise<HeroesView> {
      if ((await deps.memberName(guildId, userId)) === null) throw new ApiError('not_found');
      const view = await store.view(guildId, userId);
      return { ...view, balance: 0, gems: 0, essences: Object.fromEntries(Object.keys(view.essences ?? {}).map((id) => [id, 0])) as HeroesView['essences'] };
    },

    /** Who in the server has heroes: the one asking first (whatever they have), and not whoever left. */
    async members(guildId: string, session: Session): Promise<HeroMembers> {
      const { userId } = session;
      const owners = await store.owners(guildId, HERO_MEMBERS);
      const mine = owners.find((o) => o.userId === userId)?.heroes ?? 0;
      const listed = [{ userId, heroes: mine }, ...owners.filter((o) => o.userId !== userId)];
      const rows = await Promise.all(
        listed.map(async ({ userId: id, heroes }) => {
          const name = id === userId ? session.name : await deps.memberName(guildId, id);
          return name === null ? null : { userId: id, name, avatar: deps.avatar?.(guildId, id) ?? avatarUrl(id, id === userId ? session.avatar : null), heroes, you: id === userId };
        }),
      );
      return { members: rows.filter((row) => row !== null) };
    },

    buy: async (guildId: string, userId: string, id: string): Promise<HeroesView> => answer(await store.buy(guildId, userId, id)),
    equip: async (guildId: string, userId: string, hero: string, slot: HeroSlot, copy: string): Promise<HeroesView> =>
      answer(await store.equip(guildId, userId, hero, slot, copy)),
    unequip: async (guildId: string, userId: string, hero: string, slot: HeroSlot | null): Promise<HeroesView> =>
      answer(await store.unequip(guildId, userId, hero, slot)),
    perks: async (guildId: string, userId: string, hero: string, perks: readonly string[]): Promise<HeroesView> =>
      answer(await store.perks(guildId, userId, hero, perks)),
    transcend: async (guildId: string, userId: string, hero: string): Promise<HeroesView> => answer(await store.transcend(guildId, userId, hero)),
  };
}
