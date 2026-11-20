import { avatarUrl } from '../auth/login.js';
import { ApiError } from '../lib/errors.js';
import { heroStore } from '../models/heroes.js';
/*
 * The TechnoMagic Raid's heroes: which are the member's, buying one (the shop) and gearing them (the heroes
 * page, transcending them, their perks, and refining, selling and locking their gear) (heroes.ts's store), and who else in the server has heroes to look at.
 */
/** How many members the list has at most. */
const HERO_MEMBERS = 50;
export function heroService(deps) {
    const store = deps.heroes ?? heroStore;
    /** The heroes as they stand after a change, or the change's error. */
    const answer = (result) => {
        if (typeof result === 'string')
            throw new ApiError(result);
        return result;
    };
    return {
        view: (guildId, userId) => store.view(guildId, userId),
        /** Someone else's heroes, to look at: only while they're in the server, and not their points, komaGems, essences, salvage rule or gear loadouts. */
        async peek(guildId, userId) {
            if ((await deps.memberName(guildId, userId)) === null)
                throw new ApiError('not_found');
            const view = await store.view(guildId, userId);
            const none = (of) => Object.fromEntries(Object.keys(of ?? {}).map((id) => [id, 0]));
            const { loadouts: _loadouts, ...shown } = view;
            return { ...shown, balance: 0, gems: 0, runeFragments: 0, reports: 0, tpScrolls: 0, essences: none(view.essences), ...(view.stones && { stones: none(view.stones) }), ...(view.crystals && { crystals: none(view.crystals) }), autoSalvage: null, lootBoxes: [] };
        },
        /** Who in the server has heroes: the one asking first (whatever they have), and not whoever left. */
        async members(guildId, session) {
            const { userId } = session;
            const owners = await store.owners(guildId, HERO_MEMBERS);
            const mine = owners.find((o) => o.userId === userId)?.heroes ?? 0;
            const listed = [{ userId, heroes: mine }, ...owners.filter((o) => o.userId !== userId)];
            const rows = await Promise.all(listed.map(async ({ userId: id, heroes }) => {
                const name = id === userId ? session.name : await deps.memberName(guildId, id);
                return name === null ? null : { userId: id, name, avatar: deps.avatar?.(guildId, id) ?? avatarUrl(id, id === userId ? session.avatar : null), heroes, you: id === userId };
            }));
            return { members: rows.filter((row) => row !== null) };
        },
        buy: async (guildId, userId, id) => answer(await store.buy(guildId, userId, id)),
        starter: async (guildId, userId) => answer(await store.starter(guildId, userId)),
        equip: async (guildId, userId, hero, slot, copy) => answer(await store.equip(guildId, userId, hero, slot, copy)),
        unequip: async (guildId, userId, hero, slot) => answer(await store.unequip(guildId, userId, hero, slot)),
        perks: async (guildId, userId, hero, perks) => answer(await store.perks(guildId, userId, hero, perks)),
        /** Puts their hero's perk page `page` in use. */
        perkPage: async (guildId, userId, hero, page) => answer(await store.perkPage(guildId, userId, hero, page)),
        /** Buys their hero its next perk page (for points) and puts it in use. */
        buyPerkPage: async (guildId, userId, hero, page) => answer(await store.buyPerkPage(guildId, userId, hero, page)),
        transcend: async (guildId, userId, hero) => answer(await store.transcend(guildId, userId, hero)),
        /** Crafts `count` Transcendence Scrolls from `set`'s Boss Crystals. */
        craftScrolls: async (guildId, userId, set, count) => answer(await store.craftScrolls(guildId, userId, set, count)),
        /** Uses one of their Transcendence Scrolls on their hero (more TP). */
        scroll: async (guildId, userId, hero) => answer(await store.scroll(guildId, userId, hero)),
        refine: async (guildId, userId, copy) => answer(await store.refine(guildId, userId, copy)),
        /** Puts one of their runes in a copy's socket (or, `rune` null, takes the one in it out). */
        rune: async (guildId, userId, copy, socket, rune) => answer(await store.rune(guildId, userId, copy, socket, rune)),
        /** Rerolls one of a copy's options (or its unique option). */
        reroll: async (guildId, userId, copy, option) => answer(await store.reroll(guildId, userId, copy, option)),
        /** Keeps a TechnoMagic copy's rerolled additional skill (or with `option` an index, a copy's rerolled option), or the one it had. */
        keep: async (guildId, userId, copy, keep, option = 'unique') => answer(await store.keep(guildId, userId, copy, keep, option)),
        /** Enhances one of a copy's options: its amount rolled again. */
        upgrade: async (guildId, userId, copy, option) => answer(await store.upgrade(guildId, userId, copy, option)),
        /** Restores a 5★ TechnoMagic piece into a 0★ Reclaimed one (King's Raid's Technomagic Restoration). */
        restore: async (guildId, userId, copy) => answer(await store.restore(guildId, userId, copy)),
        /** Sells those copies (the same one twice counts once; `locked`: locked ones too; `salvage`: the hero gear among them salvaged for komaDust). */
        async sell(guildId, userId, copies, locked = false, salvage = false) {
            const sold = await store.sell(guildId, userId, [...new Set(copies)], locked, salvage);
            if (sold === 'nothing_to_sell')
                throw new ApiError(sold);
            return { ...(await store.view(guildId, userId)), sold };
        },
        async lock(guildId, userId, copy, locked) {
            if (!(await store.lock(guildId, userId, copy, locked)))
                throw new ApiError('not_found');
            return store.view(guildId, userId);
        },
        /** Keeps the rule their hero gear's drops are salvaged by as they drop (null: none any more). */
        autoSalvage: (guildId, userId, rule) => store.autoSalvage(guildId, userId, rule),
        /** Crafts a piece of TechnoMagic `set` for its Boss Crystals and points (any of its pieces, a part picked, or a class's part picked; an accessory, of the kind picked). */
        async craft(guildId, userId, set, kind, part, cls, accessory = null) {
            const crafted = await store.craft(guildId, userId, set, kind, part, cls, accessory);
            if (typeof crafted === 'string')
                throw new ApiError(crafted);
            return crafted;
        },
        /** Saves what their hero wears (its Armor, Mantle, Accessory, Orb and Artifact) into their hero gear loadout `number`. */
        loadoutSave: async (guildId, userId, hero, number) => answer(await store.loadoutSave(guildId, userId, hero, number)),
        /** Puts their hero gear loadout `number` on their hero (off any other hero wearing its pieces). */
        loadoutEquip: async (guildId, userId, hero, number) => answer(await store.loadoutEquip(guildId, userId, hero, number)),
        /** Empties their hero gear loadout `number`. */
        loadoutReset: async (guildId, userId, number) => answer(await store.loadoutReset(guildId, userId, number)),
        /** Names their hero gear loadout `number` (empty: no name). */
        loadoutName: async (guildId, userId, number, name) => answer(await store.loadoutName(guildId, userId, number, name)),
        /** Buys their next hero gear loadout, for points. */
        loadoutBuy: async (guildId, userId) => answer(await store.loadoutBuy(guildId, userId)),
        /** Opens `count` of their Dispatch Battle Loot `box` (a background raid's): their heroes after, and what it gave. */
        async openBox(guildId, userId, box, count) {
            const opened = await store.openBox(guildId, userId, box, count);
            if (typeof opened === 'string')
                throw new ApiError(opened);
            return opened;
        },
    };
}
//# sourceMappingURL=heroes.js.map