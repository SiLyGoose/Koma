import type { ApiDeps } from '../api.js';
import { ApiError } from '../lib/errors.js';
import { gearStore, type GearSale, type GearView } from '../models/gear.js';
import { avatarUrl, type Session } from '../auth/login.js';
import type { Slot } from '../../types.js';

/* The gear page: members' gear in a server (gear.ts's store), and who else's there is to look at. */

/** Who in a server has gear to look at (GET /api/gear/members): the one asking first, then whoever owns the most. */
export interface GearMembers {
  members: { userId: string; name: string; avatar: string; copies: number; you: boolean }[];
}

/** How many members the roster lists at most. */
const GEAR_MEMBERS = 50;

export type GearService = ReturnType<typeof gearService>;

export function gearService(deps: ApiDeps) {
  const store = deps.gear ?? gearStore;

  return {
    view: (guildId: string, userId: string): Promise<GearView> => store.view(guildId, userId),

    /** Someone else's gear, to look at: only while they're in the server. */
    async peek(guildId: string, userId: string): Promise<GearView> {
      if ((await deps.memberName(guildId, userId)) === null) throw new ApiError('not_found');
      return store.peek(guildId, userId);
    },

    /** Who in the server has gear: the one asking first (whatever they own), and not whoever left. */
    async members(guildId: string, session: Session): Promise<GearMembers> {
      const { userId } = session;
      const owners = await store.owners(guildId, GEAR_MEMBERS);
      const mine = owners.find((o) => o.userId === userId)?.copies ?? 0;
      const rows = await Promise.all(
        [{ userId, copies: mine }, ...owners.filter((o) => o.userId !== userId)].map(async ({ userId: id, copies }) => {
          const name = id === userId ? session.name : await deps.memberName(guildId, id);
          return name === null ? null : { userId: id, name, avatar: deps.avatar?.(guildId, id) ?? avatarUrl(id, id === userId ? session.avatar : null), copies, you: id === userId };
        }),
      );
      return { members: rows.filter((row) => row !== null) };
    },

    async equip(guildId: string, userId: string, copy: string): Promise<GearView> {
      if (!(await store.equip(guildId, userId, copy))) throw new ApiError('not_found');
      return store.view(guildId, userId);
    },

    async unequip(guildId: string, userId: string, slot: Slot): Promise<GearView> {
      await store.unequip(guildId, userId, slot);
      return store.view(guildId, userId);
    },

    async unequipAll(guildId: string, userId: string): Promise<GearView> {
      await store.unequipAll(guildId, userId);
      return store.view(guildId, userId);
    },

    async switchLoadout(guildId: string, userId: string, loadout: number): Promise<GearView> {
      if (!(await store.switchLoadout(guildId, userId, loadout))) throw new ApiError('busy');
      return store.view(guildId, userId);
    },

    /** Refines a copy a level, using up `material` (null: the lowest-level spare it can). */
    async refine(guildId: string, userId: string, copy: string, material: string | null): Promise<GearView> {
      const result = await store.refine(guildId, userId, copy, material);
      if (result !== 'ok') throw new ApiError(result);
      return store.view(guildId, userId);
    },

    async forge(guildId: string, userId: string, copy: string): Promise<GearView> {
      const result = await store.forge(guildId, userId, copy);
      if (result !== 'ok') throw new ApiError(result);
      return store.view(guildId, userId);
    },

    /** Sells those copies (the same one twice counts once). */
    async sell(guildId: string, userId: string, copies: string[]): Promise<GearView & { sold: GearSale }> {
      const sold = await store.sell(guildId, userId, [...new Set(copies)]);
      if (sold === 'nothing_to_sell') throw new ApiError(sold);
      return { ...(await store.view(guildId, userId)), sold };
    },

    async lock(guildId: string, userId: string, copy: string, locked: boolean): Promise<GearView> {
      if (!(await store.lock(guildId, userId, copy, locked))) throw new ApiError('not_found');
      return store.view(guildId, userId);
    },
  };
}
