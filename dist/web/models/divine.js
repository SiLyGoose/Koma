import { BLASPHEMY_STORAGE, DIVINE_SHOP } from '../../constants/divine.js';
import { divinePrice } from '../../config.js';
import { BLASPHEMY_BREAK_FRAGMENTS } from '../../data/divine-kr.js';
import { ITEMS_BY_ID } from '../../data/items.js';
import { KR_RUNES_BY_ID } from '../../data/kr-gear.js';
import { collections } from '../../db.js';
import { blasphemyCost, bossOpenPrice, clearsNow, DIVINE_GROUPS, DIVINE_INFO, DIVINE_LEVELS, dungeonsOf, enterRefusal, finalLines, finalRow, highestOpenable, KARMA_OPEN_PRICE, KR_BLASPHEMY, lineText, openingOpen, rewardLevelFirst, rewardLevels, sideLines, sumLines, windowLive, } from '../../lib/game/divine.js';
import { krLine, HERO_STATS } from '../../lib/game/heroes.js';
import { breakBlasphemy, breakSocketedBlasphemy, buyVoidRunes, craftBlasphemy, craftDivineArtifact, extendBlasphemyStorage, FRAGMENT_ARTIFACTS, nextExtension, openDivine, resetDivine, socketBlasphemy, socketedBlasphemy, storageOf, unsocketBlasphemy, useUniqueTicket, } from '../../services/divine.js';
/*
 * The Divine Punishment Raid's page (/api/divine): the member's openings, counters, shop, crafting and Runes of Blasphemy as the
 * site shows them (divineView), and the store that changes them (services/divine.ts), each answering the view after or why not.
 */
const GROUP_NAME = { apocalypsion: 'Apocalypsion', solenis: 'Solenis' };
const FRAGMENTS = ['doomstone', 'tear', 'fuel', 'engraving'];
const SOCKETS = ['doh', 'laz', 'geb', 'oth', 'ans'];
const TIERS = ['1', '2', '3', '4', '5'];
const byTier = (of) => Object.fromEntries(TIERS.map((tier) => [tier, of?.[tier] ?? 0]));
/** One of the member's Runes of Blasphemy as the page shows it (null: its rune isn't the sim's). */
export function blasphemyView(copy, socketed, data = KR_BLASPHEMY) {
    const rune = data.find((one) => one.id === copy.rune);
    if (!rune)
        return null;
    const stat = rune.main.stat;
    return {
        id: copy.id,
        rune: rune.id,
        name: rune.name,
        group: rune.group,
        socket: rune.socket,
        color: rune.color,
        icon: rune.icon,
        main: { stat, value: copy.main, line: stat in HERO_STATS ? krLine(stat, copy.main) : stat },
        lines: rune.lines.map((line, i) => ({ skill: line.skill, value: copy.lines[i] ?? line.min, text: lineText(line, copy.lines[i] ?? line.min) })),
        socketed,
        at: copy.at.toISOString(),
    };
}
/** Whether a rune is a Rune of Blasphemy's gauge's: Legendary, or Velkazar (grade 5, not Ancient). */
const gaugeRune = (id) => {
    const rune = KR_RUNES_BY_ID.get(id);
    return !!rune && (rune.grade === 6 || (rune.grade === 5 && rune.ancient !== true));
};
/** A group as the page shows it: its window, prices, best level, Karma run, dungeons (each with why it can't be entered now), Blood and shards. */
function groupView(member, group, now, info) {
    const state = member?.divine?.[group];
    const boss = state?.boss;
    return {
        id: group,
        name: GROUP_NAME[group],
        window: boss && windowLive(boss, now) ? { open: openingOpen(boss, now), level: boss.level, since: boss.since.toISOString(), expires: boss.expires.toISOString(), clears: boss.clears, cleared: [...boss.cleared] } : null,
        price: bossOpenPrice(clearsNow(boss, now)),
        highest: highestOpenable(state),
        best: state?.best ?? 0,
        karma: { open: state?.karma?.open === true, price: KARMA_OPEN_PRICE },
        dungeons: info.filter((one) => one.group === group).map((one) => ({ id: one.id, name: one.name, kind: one.kind, time: one.time, refusal: enterRefusal(one, state, now, info) })),
        blood: member?.blood?.[group] ?? 0,
        empty: byTier(member?.shards?.empty?.[group]),
        full: byTier(member?.shards?.full?.[group]),
    };
}
/** The Divine Punishment page's view, from the member and where their Runes of Blasphemy are socketed. */
export function divineView(member, socketed, now = new Date(), data = KR_BLASPHEMY, info = DIVINE_INFO) {
    const owned = member?.blasphemy ?? [];
    const slots = storageOf(member);
    const cost = blasphemyCost(owned.length);
    return {
        balance: member?.points ?? 0,
        levels: DIVINE_LEVELS,
        groups: DIVINE_GROUPS.map((group) => groupView(member, group, now, info)),
        fragments: Object.fromEntries(FRAGMENTS.map((id) => [id, member?.dpFragments?.[id] ?? 0])),
        voidRunes: Object.fromEntries(SOCKETS.map((id) => [id, member?.voidRunes?.[id] ?? 0])),
        uniqueTickets: member?.uniqueTickets ?? 0,
        runeFragments: member?.runeFragments ?? 0,
        ingredientRunes: Object.fromEntries(Object.entries(member?.runes ?? {}).filter(([id, n]) => n > 0 && gaugeRune(id))),
        shop: { voidPrice: divinePrice('voidPrice') },
        artifacts: FRAGMENTS.map((fragment) => ({ fragment, itemId: FRAGMENT_ARTIFACTS[fragment], name: ITEMS_BY_ID.get(FRAGMENT_ARTIFACTS[fragment])?.name ?? FRAGMENT_ARTIFACTS[fragment], fragments: DIVINE_SHOP.artifactFragments, points: divinePrice('artifactPrice') })),
        blasphemy: {
            owned: owned.flatMap((copy) => blasphemyView(copy, socketed.get(copy.id) ?? null, data) ?? []),
            slots,
            stored: owned.filter((copy) => !socketed.has(copy.id)).length,
            most: BLASPHEMY_STORAGE.most,
            extend: nextExtension(slots),
            keepPrice: divinePrice('blasphemyKeepPrice'),
            breakFragments: BLASPHEMY_BREAK_FRAGMENTS,
            craft: cost,
            recipes: data.map((one) => ({ id: one.id, name: one.name, group: one.group, socket: one.socket, legend: one.legend })),
        },
    };
}
/** Every set of `sides` (the empty set first, then by size, each in their order). */
function subsets(sides) {
    const out = [[]];
    for (let size = 1; size <= sides.length; size++) {
        const pick = (from, chosen) => {
            if (chosen.length === size)
                return void out.push(chosen);
            for (let i = from; i < sides.length; i++)
                pick(i + 1, [...chosen, sides[i]]);
        };
        pick(0, []);
    }
    return out;
}
/**
 * A group's Reward List at `level` (King's Raid's PunishmentRaidRewardInfoPopup), read from the lines a win pays (lib/game/divine.ts
 * sideLines, finalLines): its final boss's Clear Reward and its win by each set of side bosses cleared its table has, and each side
 * boss's Sub reward. No level: the one King's Raid's opens at (the opening's, else the one after the best). Refused: a level not 1
 * to five past the best.
 */
export function rewardsView(state, group, level, now = new Date(), info = DIVINE_INFO) {
    const most = rewardLevels(state);
    const at = level ?? rewardLevelFirst(state, now);
    if (!Number.isInteger(at) || at < 1 || at > most)
        return 'bad_level';
    const items = (lines) => sumLines(lines).map((line) => ({ key: line.key, count: line.count, ...(line.ratio !== undefined && { ratio: line.ratio }) }));
    const final = dungeonsOf(group, 'final', info)[0];
    const sides = dungeonsOf(group, 'side', info);
    const finalId = final?.id ?? group;
    return {
        group,
        level: at,
        most,
        final: {
            id: finalId,
            name: final?.name ?? GROUP_NAME[group],
            items: items(finalLines(finalId, [], at)),
            byCleared: subsets(sides.map((one) => one.id))
                .filter((cleared) => finalRow(finalId, cleared))
                .map((cleared) => ({ cleared, items: items(finalLines(finalId, cleared, at)) })),
        },
        sides: sides.map((one) => ({ id: one.id, name: one.name, items: items(sideLines(one.id, at)) })),
    };
}
/** The member's view, read. */
async function load(guildId, userId) {
    const [member, socketed] = await Promise.all([collections().members.findOne({ guildId, userId }), socketedBlasphemy(guildId, userId)]);
    return divineView(member, socketed);
}
/** The view after a change, or why it wasn't made. */
const after = async (guildId, userId, result) => (result.ok ? load(guildId, userId) : result.reason);
/** The same, with what the change came to. */
async function afterWith(guildId, userId, result, key) {
    if (!result.ok)
        return result.reason;
    return { view: await load(guildId, userId), [key]: result.value };
}
export const divineStore = {
    view: load,
    async rewards(guildId, userId, group, level) {
        const member = await collections().members.findOne({ guildId, userId }, { projection: { divine: 1 } });
        return rewardsView(member?.divine?.[group], group, level);
    },
    open: async (guildId, userId, group, type, level) => after(guildId, userId, await openDivine(guildId, userId, group, type, level)),
    reset: async (guildId, userId, group) => after(guildId, userId, await resetDivine(guildId, userId, group)),
    buyVoid: async (guildId, userId, socket, count) => after(guildId, userId, await buyVoidRunes(guildId, userId, socket, count)),
    artifact: async (guildId, userId, fragment) => afterWith(guildId, userId, await craftDivineArtifact(guildId, userId, fragment), 'crafted'),
    ticket: async (guildId, userId, of, pick) => afterWith(guildId, userId, await useUniqueTicket(guildId, userId, of, pick), 'given'),
    craft: async (guildId, userId, rune, ingredients) => {
        const made = await craftBlasphemy(guildId, userId, rune, ingredients);
        if (!made.ok)
            return made.reason;
        const view = await load(guildId, userId);
        const crafted = view.blasphemy.owned.find((one) => one.id === made.value.id) ?? blasphemyView(made.value, null);
        return crafted ? { view, crafted } : 'busy';
    },
    breakStored: async (guildId, userId, id) => afterWith(guildId, userId, await breakBlasphemy(guildId, userId, id), 'fragments'),
    breakSocketed: async (guildId, userId, copy, socket) => afterWith(guildId, userId, await breakSocketedBlasphemy(guildId, userId, copy, socket), 'fragments'),
    extend: async (guildId, userId) => after(guildId, userId, await extendBlasphemyStorage(guildId, userId)),
    socket: async (guildId, userId, copy, socket, id) => after(guildId, userId, await socketBlasphemy(guildId, userId, copy, socket, id)),
    unsocket: async (guildId, userId, copy, socket) => after(guildId, userId, await unsocketBlasphemy(guildId, userId, copy, socket)),
};
//# sourceMappingURL=divine.js.map