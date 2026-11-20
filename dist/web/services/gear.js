import { ApiError } from '../lib/errors.js';
import { gearStore } from '../models/gear.js';
import { avatarUrl } from '../auth/login.js';
/* The gear page: members' gear in a server (gear.ts's store), and who else's there is to look at. */
/** How many members the roster lists at most. */
const GEAR_MEMBERS = 50;
export function gearService(deps) {
    const store = deps.gear ?? gearStore;
    return {
        view: (guildId, userId) => store.view(guildId, userId),
        /** Someone else's gear, to look at: only while they're in the server. */
        async peek(guildId, userId) {
            if ((await deps.memberName(guildId, userId)) === null)
                throw new ApiError('not_found');
            return store.peek(guildId, userId);
        },
        /** Who in the server has gear: the one asking first (whatever they own), and not whoever left. */
        async members(guildId, session) {
            const { userId } = session;
            const owners = await store.owners(guildId, GEAR_MEMBERS);
            const mine = owners.find((o) => o.userId === userId)?.copies ?? 0;
            const listed = [{ userId, copies: mine }, ...owners.filter((o) => o.userId !== userId)];
            const classes = await store.classes(guildId, listed.map((o) => o.userId));
            const rows = await Promise.all(listed.map(async ({ userId: id, copies }, i) => {
                const name = id === userId ? session.name : await deps.memberName(guildId, id);
                return name === null
                    ? null
                    : { userId: id, name, avatar: deps.avatar?.(guildId, id) ?? avatarUrl(id, id === userId ? session.avatar : null), copies, you: id === userId, class: classes[i] ?? null };
            }));
            return { members: rows.filter((row) => row !== null) };
        },
        async equip(guildId, userId, copy) {
            if (!(await store.equip(guildId, userId, copy)))
                throw new ApiError('not_found');
            return store.view(guildId, userId);
        },
        async unequip(guildId, userId, slot) {
            await store.unequip(guildId, userId, slot);
            return store.view(guildId, userId);
        },
        async unequipAll(guildId, userId) {
            await store.unequipAll(guildId, userId);
            return store.view(guildId, userId);
        },
        async switchLoadout(guildId, userId, loadout) {
            const result = await store.switchLoadout(guildId, userId, loadout);
            if (result !== 'ok')
                throw new ApiError(result);
            return store.view(guildId, userId);
        },
        /** Unlocks their next loadout (`loadout`, which has to be it) for its price. */
        async unlockLoadout(guildId, userId, loadout) {
            const result = await store.unlockLoadout(guildId, userId, loadout);
            if (result !== 'ok')
                throw new ApiError(result);
            return store.view(guildId, userId);
        },
        /** Names one of their loadouts (an empty name: its default one again). */
        async renameLoadout(guildId, userId, loadout, name) {
            const result = await store.renameLoadout(guildId, userId, loadout, name);
            if (result !== 'ok')
                throw new ApiError(result);
            return store.view(guildId, userId);
        },
        /** Refines a copy a level, using up `material` (null: the lowest-level spare it can). */
        async refine(guildId, userId, copy, material) {
            const result = await store.refine(guildId, userId, copy, material);
            if (result !== 'ok')
                throw new ApiError(result);
            return store.view(guildId, userId);
        },
        /** Sells those copies (the same one twice counts once; `salvage`: the hero gear among them salvaged for komaDust). */
        async sell(guildId, userId, copies, salvage = false) {
            const sold = await store.sell(guildId, userId, [...new Set(copies)], false, salvage);
            if (sold === 'nothing_to_sell')
                throw new ApiError(sold);
            return { ...(await store.view(guildId, userId)), sold };
        },
        /** Picks their raid class (null: none). It counts from their next raid's fight. */
        async setClass(guildId, userId, id) {
            await store.setClass(guildId, userId, id);
            return store.view(guildId, userId);
        },
        async lock(guildId, userId, copy, locked) {
            if (!(await store.lock(guildId, userId, copy, locked)))
                throw new ApiError('not_found');
            return store.view(guildId, userId);
        },
    };
}
//# sourceMappingURL=gear.js.map