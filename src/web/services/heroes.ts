import type { HeroesCrafted, HeroPart, TmCraftKind } from '../../protocol/heroes.js';
import type { TmSetId } from '../../protocol/items.js';
import type { RaidClassId } from '../../constants/raid.js';
import type { ApiDeps } from '../api.js';
import { avatarUrl, type Session } from '../auth/login.js';
import { ApiError } from '../lib/errors.js';
import { heroStore, type HeroesView } from '../models/heroes.js';
import type { HeroSlot } from '../../types.js';
import type { HeroEquipError, HeroesSold, HeroKeep, HeroMembers, HeroOptionError, HeroPerksError, HeroRefineError, HeroRuneError, HeroTranscendError, SalvageRule } from '../../protocol/heroes.js';

/** Every reason a change to their heroes or their gear isn't made. */
type HeroError = HeroEquipError | HeroPerksError | HeroRefineError | HeroTranscendError | HeroRuneError | HeroOptionError | 'owned' | 'too_poor';

export type { HeroesSold, HeroMembers };

/*
 * The TechnoMagic Raid's heroes: which are the member's, buying one (the shop) and gearing them (the heroes
 * page, transcending them, their perks, and refining, selling and locking their gear) (heroes.ts's store), and who else in the server has heroes to look at.
 */

/** How many members the list has at most. */
const HERO_MEMBERS = 50;

export type HeroService = ReturnType<typeof heroService>;

export function heroService(deps: ApiDeps) {
  const store = deps.heroes ?? heroStore;

  /** The heroes as they stand after a change, or the change's error. */
  const answer = (result: HeroesView | HeroError): HeroesView => {
    if (typeof result === 'string') throw new ApiError(result);
    return result;
  };

  return {
    view: (guildId: string, userId: string): Promise<HeroesView> => store.view(guildId, userId),

    /** Someone else's heroes, to look at: only while they're in the server, and not their points, komaGems, essences or salvage rule. */
    async peek(guildId: string, userId: string): Promise<HeroesView> {
      if ((await deps.memberName(guildId, userId)) === null) throw new ApiError('not_found');
      const view = await store.view(guildId, userId);
      const none = <K extends string>(of: Partial<Record<K, number>> | undefined): Record<K, number> => Object.fromEntries(Object.keys(of ?? {}).map((id) => [id, 0])) as Record<K, number>;
      return { ...view, balance: 0, gems: 0, runeFragments: 0, essences: none(view.essences), ...(view.stones && { stones: none(view.stones) }), ...(view.crystals && { crystals: none(view.crystals) }), autoSalvage: null };
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
    refine: async (guildId: string, userId: string, copy: string): Promise<HeroesView> => answer(await store.refine(guildId, userId, copy)),
    /** Puts one of their runes in a copy's socket (or, `rune` null, takes the one in it out). */
    rune: async (guildId: string, userId: string, copy: string, socket: number, rune: string | null): Promise<HeroesView> => answer(await store.rune(guildId, userId, copy, socket, rune)),
    /** Rerolls one of a copy's options (or its unique option). */
    reroll: async (guildId: string, userId: string, copy: string, option: number | 'unique'): Promise<HeroesView> => answer(await store.reroll(guildId, userId, copy, option)),
    /** Keeps a TechnoMagic copy's rerolled additional skill, or the one it had. */
    keep: async (guildId: string, userId: string, copy: string, keep: HeroKeep): Promise<HeroesView> => answer(await store.keep(guildId, userId, copy, keep)),
    /** Enhances one of a copy's options: its amount rolled again. */
    upgrade: async (guildId: string, userId: string, copy: string, option: number): Promise<HeroesView> => answer(await store.upgrade(guildId, userId, copy, option)),

    /** Sells those copies (the same one twice counts once; `locked`: locked ones too; `salvage`: the hero gear among them salvaged for komaDust). */
    async sell(guildId: string, userId: string, copies: string[], locked = false, salvage = false): Promise<HeroesSold> {
      const sold = await store.sell(guildId, userId, [...new Set(copies)], locked, salvage);
      if (sold === 'nothing_to_sell') throw new ApiError(sold);
      return { ...(await store.view(guildId, userId)), sold };
    },

    async lock(guildId: string, userId: string, copy: string, locked: boolean): Promise<HeroesView> {
      if (!(await store.lock(guildId, userId, copy, locked))) throw new ApiError('not_found');
      return store.view(guildId, userId);
    },

    /** Keeps the rule their hero gear's drops are salvaged by as they drop (null: none any more). */
    autoSalvage: (guildId: string, userId: string, rule: SalvageRule | null): Promise<HeroesView> => store.autoSalvage(guildId, userId, rule),

    /** Crafts a piece of TechnoMagic `set` for its Boss Crystals and points (any of its pieces, a part picked, or a class's part picked). */
    async craft(guildId: string, userId: string, set: TmSetId, kind: TmCraftKind, part: HeroPart | null, cls: RaidClassId | null): Promise<HeroesCrafted> {
      const crafted = await store.craft(guildId, userId, set, kind, part, cls);
      if (typeof crafted === 'string') throw new ApiError(crafted);
      return crafted;
    },
  };
}
