import type { ApiDeps } from '../api.js';
import { ApiError } from '../lib/errors.js';
import { gearStore, type GearSale, type GearView } from '../models/gear.js';
import { avatarUrl, type Session } from '../auth/login.js';
import type { RaidClassId } from '../../constants/index.js';
import type { Slot } from '../../types.js';
import type { GearMembers, GearSold } from '../../protocol/gear.js';

export type { GearMembers };

/* The gear page: members' gear in a server (gear.ts's store), and who else's there is to look at. */

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
      const listed = [{ userId, copies: mine }, ...owners.filter((o) => o.userId !== userId)];
      const classes = await store.classes(
        guildId,
        listed.map((o) => o.userId),
      );
      const rows = await Promise.all(
        listed.map(async ({ userId: id, copies }, i) => {
          const name = id === userId ? session.name : await deps.memberName(guildId, id);
          return name === null
            ? null
            : { userId: id, name, avatar: deps.avatar?.(guildId, id) ?? avatarUrl(id, id === userId ? session.avatar : null), copies, you: id === userId, class: classes[i] ?? null };
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
      const result = await store.switchLoadout(guildId, userId, loadout);
      if (result !== 'ok') throw new ApiError(result);
      return store.view(guildId, userId);
    },

    /** Unlocks their next loadout (`loadout`, which has to be it) for its price. */
    async unlockLoadout(guildId: string, userId: string, loadout: number): Promise<GearView> {
      const result = await store.unlockLoadout(guildId, userId, loadout);
      if (result !== 'ok') throw new ApiError(result);
      return store.view(guildId, userId);
    },

    /** Names one of their loadouts (an empty name: its default one again). */
    async renameLoadout(guildId: string, userId: string, loadout: number, name: string): Promise<GearView> {
      const result = await store.renameLoadout(guildId, userId, loadout, name);
      if (result !== 'ok') throw new ApiError(result);
      return store.view(guildId, userId);
    },

    /** Refines a copy a level, using up `material` (null: the lowest-level spare it can). */
    async refine(guildId: string, userId: string, copy: string, material: string | null): Promise<GearView> {
      const result = await store.refine(guildId, userId, copy, material);
      if (result !== 'ok') throw new ApiError(result);
      return store.view(guildId, userId);
    },

    /** Sells those copies (the same one twice counts once; `salvage`: the hero gear among them salvaged for komaDust). */
    async sell(guildId: string, userId: string, copies: string[], salvage = false): Promise<GearSold> {
      const sold = await store.sell(guildId, userId, [...new Set(copies)], false, salvage);
      if (sold === 'nothing_to_sell') throw new ApiError(sold);
      return { ...(await store.view(guildId, userId)), sold };
    },

    /** Picks their raid class (null: none). It counts from their next raid's fight. */
    async setClass(guildId: string, userId: string, id: RaidClassId | null): Promise<GearView> {
      await store.setClass(guildId, userId, id);
      return store.view(guildId, userId);
    },

    async lock(guildId: string, userId: string, copy: string, locked: boolean): Promise<GearView> {
      if (!(await store.lock(guildId, userId, copy, locked))) throw new ApiError('not_found');
      return store.view(guildId, userId);
    },
  };
}
