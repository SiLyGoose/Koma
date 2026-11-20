import { craftTmPiece } from '../../services/technomagic.js';
import { LOOT_BOXES, LOOT_BOXES_BY_ID } from '../../data/loot-boxes.js';
import { LOOT_OPEN_MOST, openLootBoxes } from '../../services/loot-boxes.js';
import { DRAGONS } from '../../lib/game/dragon.js';
import { TM_BOSSES } from '../../lib/game/technomagic.js';
import { CONFIG, rerollPrice, restorePrice, runeKeepPrice, valueRerollPrice } from '../../config.js';
import { ITEMS_BY_ID } from '../../data/items.js';
import { HEROES } from '../../data/heroes.js';
import { ARTIFACT_TEXT, KR_POOLS, KR_RUNES_BY_ID, KR_SETS, KR_TM_SETS, krOptionValue, poolOption, UNIQUE_REROLL_GEMS, upgradable, upgradePrice } from '../../data/kr-gear.js';
import { activePerkPage, ESSENCES, keptPerks, PERK_PAGES_MAX, perkPageCount, perkPagePrice, scrollPoints, transcendCost, transcendLevel, transcendPoints } from '../../data/transcend.js';
import { collections } from '../../db.js';
import { activeSet, activeTmEffects, copyMainStat, countsOnce, fitsSlot, HERO_STAT_IDS, heroBonus, heroItemLines, heroOnly, heroSet, heroSkills, heroStatLines, heroWearable, heroWorn, krLine, partOf, perkLines, potentialLines, raidValue, runeLines, setBonusLines, setCounts, setLines, SIDE_SLOTS, socketsOf, treasureTier, wieldedBy, } from '../../lib/game/heroes.js';
import { uniqueTreasureText } from '../../../vendor/technomagic-sim.mjs';
import { keptCopyIds } from '../../lib/game/items/loadouts.js';
import { maxLevelOf, starsOf } from '../../lib/game/items/refine.js';
import { equippedCopyIds, itemSalvage, itemSellPrice } from '../../lib/game/items/sell.js';
import { TM_SKILLS_BY_ID, tmSkillLine } from '../../lib/game/technomagic.js';
import { potentialStep } from '../../data/tm-potentials.js';
import { wornSkin } from '../../services/hero-outfits.js';
import { buyHeroLoadout, equipHeroLoadout, nameHeroLoadout, resetHeroLoadout, saveHeroLoadout } from '../../services/hero-loadouts.js';
import { heroLoadoutViews, nextHeroLoadoutPrice } from '../../lib/game/hero-loadouts.js';
import { buyHero, buyPerkPage, grantStarterHero, craftTpScrolls, equipHero, pickHeroPerks, switchPerkPage, transcendHero, unequipHero, useTpScroll } from '../../services/heroes.js';
import { keepOption, keepTmSkill, rerollOption, restoreTmPiece, socketRune, tmRestorable, unsocketRune, upgradeOption } from '../../services/kr-gear.js';
import { autoSalvageOf, setAutoSalvage } from '../../services/items/salvage.js';
import { HERO_SLOTS } from '../../types.js';
import { TM_CRYSTALS, TM_REPORTS, tmSalvageCrystals, tmSalvageStones } from '../../constants/technomagic.js';
import { isTmPiece, tmStoneClass } from '../../data/kr-gear.js';
import { RAID_CLASS_IDS } from '../../protocol/raid.js';
import { copiesByItem, gearStore, refineState } from './gear.js';
import { blasphemyLookup, blasphemyMain, isBlasphemyRef, lineText } from '../../lib/game/divine.js';
/** The Dispatch Battle Loot a member holds (MemberDoc.lootBoxes), in data/loot-boxes.ts's order: the Galgoria Raid's, then each dragon's Hard and Normal stages. */
function lootStacks(held) {
    const bossName = (id) => [...TM_BOSSES, ...DRAGONS].find((boss) => boss.id === id)?.name ?? id;
    return LOOT_BOXES.flatMap((box) => {
        const count = held?.[box.id] ?? 0;
        return count > 0 ? [{ id: box.id, name: box.name, icon: box.icon, raid: box.raid, boss: box.boss, bossName: bossName(box.boss), mode: box.mode, stage: box.stage, count }] : [];
    });
}
/** A hero's additional skills as lines, one for each skill (how many, when more than one), like "✴️ Vigor ×2: Increases DMG…". */
export function skillLines(skills) {
    const counts = new Map();
    for (const id of skills)
        counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts].flatMap(([id, count]) => {
        const skill = TM_SKILLS_BY_ID.get(id);
        return skill ? [`✴️ ${skill.name}${count > 1 ? ` ×${count}` : ''}: ${skill.about}`] : [];
    });
}
/** A rune as the page shows it (null: none such). */
export function runeView(id) {
    const rune = KR_RUNES_BY_ID.get(id);
    return rune ? { id: rune.id, name: rune.name, grade: rune.grade, color: rune.color, icon: rune.icon, lines: runeLines(rune.id) } : null;
}
/** Which classes each of a Rune of Blasphemy's three lines is for (lib/game/divine.ts CLASS_LINE). */
const BLASPHEMY_LINE_CLASSES = ['Warrior/Knight', 'Archer/Assassin/Mechanic', 'Wizard/Priest'];
/** A Rune of Blasphemy in a socket (`bl:<id>`) as the page shows it, as a rune: grade 7 (above Legendary), its main stat and its three lines with their rolls (null: none such). */
export function blasphemyRuneView(ref, lookup) {
    const on = lookup.get(ref);
    if (!on)
        return null;
    const { data, copy } = on;
    const main = HERO_STAT_IDS_SET.has(data.main.stat) ? [krLine(data.main.stat, copy.main)] : [];
    return { id: ref, name: data.name, grade: 7, color: data.color, icon: data.icon, lines: [...main, ...data.lines.map((line, i) => `${BLASPHEMY_LINE_CLASSES[i]}: ${lineText(line, copy.lines[i] ?? line.min)}`)] };
}
/** A socket's rune as the page shows it: a rune's, or a Rune of Blasphemy's (`bl:<id>`, from the member's). */
const socketView = (id, lookup) => (isBlasphemyRef(id) ? blasphemyRuneView(id, lookup) : runeView(id));
/** The member's runes, best first (grade, then name). */
export function runeStacks(runes) {
    return Object.entries(runes ?? {})
        .flatMap(([id, count]) => {
        const view = runeView(id);
        const rune = KR_RUNES_BY_ID.get(id);
        return view && rune && count > 0 ? [{ ...view, count, parts: [...rune.parts] }] : [];
    })
        .sort((a, b) => b.grade - a.grade || a.name.localeCompare(b.name));
}
const HERO_STAT_IDS_SET = new Set(HERO_STAT_IDS);
/**
 * A copy's options as the page shows them: a unique treasure's, its potentials, each so many steps of its range's
 * (potentialStep: an enhance's), rerolled for the config's hero.rerollPrice points, as any hero gear's.
 */
function optionViews(item, copy) {
    if (item.uniqueTreasure) {
        return (copy.tmPotentials ?? []).flatMap((potential) => {
            const range = CONFIG.hero.potentials[potential.stat];
            const line = potentialLines([potential])[0];
            if (!range || !line)
                return [];
            const size = potentialStep(range);
            const steps = Math.round((range.max - range.min) / size);
            return [{ stat: potential.stat, line, step: Math.min(steps, Math.max(0, Math.round((potential.value - range.min) / size))), steps, price: rerollPrice() }];
        });
    }
    const kr = item.kr;
    if (!kr)
        return [];
    return (copy.options ?? []).map((option) => ({
        stat: option.stat,
        line: HERO_STAT_IDS_SET.has(option.stat) ? krLine(option.stat, krOptionValue(kr, option)) : option.stat,
        step: option.step,
        steps: poolOption(kr.pool, option.stat)?.steps ?? 0,
        // (A TechnoMagic piece's: its set's Boss Crystals.)
        price: isTmPiece(item) ? TM_CRYSTALS.reroll : rerollPrice(),
    }));
}
/** A copy's rerolled option waiting to be kept, as its options are shown (null: none waits). */
function rerolledOptionView(item, copy) {
    // (A unique treasure's: one of its potentials.)
    const rolled = item.uniqueTreasure ? copy.potentialPending : copy.optionPending;
    const view = copy.potentialPending && item.uniqueTreasure
        ? optionViews(item, { ...copy, tmPotentials: [copy.potentialPending.option] })[0]
        : copy.optionPending && !item.uniqueTreasure
            ? optionViews(item, { ...copy, options: [copy.optionPending.option] })[0]
            : undefined;
    return rolled && view ? { ...view, index: rolled.index } : null;
}
/** What a copy's next reroll costs (the cheapest of its options'), its unique option's, and an upgrade; null where it can't be. */
function optionCosts(item, copy) {
    const kr = item.kr;
    const options = copy.options ?? [];
    const pool = kr?.pool ? KR_POOLS[kr.pool] : undefined;
    return {
        reroll: item.uniqueTreasure ? ((copy.tmPotentials ?? []).length > 0 ? rerollPrice() : null) : kr && pool && options.length > 0 ? (isTmPiece(item) ? TM_CRYSTALS.reroll : rerollPrice()) : null,
        // (In komaGems.)
        rerollUnique: kr?.unique ? UNIQUE_REROLL_GEMS : null,
        // (Enhancing rolls an amount again, so a copy with options always can, at their top or not; a unique treasure's too.)
        upgrade: item.uniqueTreasure ? ((copy.tmPotentials ?? []).length > 0 ? valueRerollPrice('unique') : null) : kr && upgradable(kr) && options.length > 0 ? upgradePrice(kr) : null,
    };
}
/** The heroes' view, from the member's copies and member document. */
export function heroesView(copies, member) {
    const worn = heroWorn(member);
    // (Their Runes of Blasphemy, which a copy's sockets name as `bl:<id>`.)
    const blasphemy = blasphemyLookup(member?.blasphemy);
    // (Never used up by a refine or sold: what the member, any loadout and their heroes wear.)
    const kept = new Set([...equippedCopyIds(member?.equipment), ...keptCopyIds(member)]);
    const lit = activeTmEffects(copies, member);
    const classOf = (heroId) => (heroId ? (HEROES.find((one) => one.id === heroId)?.class ?? null) : null);
    // (What each hero wears, for its sets' counts.)
    const onHero = new Map();
    for (const copy of copies) {
        const hero = worn.get(copy._id);
        const item = ITEMS_BY_ID.get(copy.itemId);
        if (hero && item)
            onHero.set(hero, [...(onHero.get(hero) ?? []), { item }]);
    }
    const sameItem = copiesByItem(copies);
    const list = [];
    const pieces = new Map();
    for (const copy of copies) {
        const item = ITEMS_BY_ID.get(copy.itemId);
        const part = item ? partOf(item) : null;
        if (!item || !heroWearable(item) || part === null)
            continue;
        const maxLevel = maxLevelOf(item);
        // (Its stars, from 0★: King's Raid's.)
        const level = Math.min(starsOf(item, copy.level), maxLevel);
        const kr = item.kr;
        const runes = Array.from({ length: socketsOf(item) }, (_, i) => copy.runes?.[i] ?? null);
        const hero = worn.get(copy._id);
        const heroClass = classOf(hero);
        const setId = kr?.set;
        const count = setId && hero && heroClass ? (setCounts(onHero.get(hero) ?? [], heroClass).get(setId) ?? 0) : 0;
        const ownClass = heroClass ?? (kr && kr.classes.length === 1 ? kr.classes[0] : null);
        const bonuses = setId ? setBonusLines(setId, ownClass, count) : [];
        const tmBonus = setId && KR_TM_SETS.includes(setId) ? bonuses[0] : undefined;
        const view = {
            id: copy._id,
            itemId: item.id,
            name: copy.reclaimed ? `Reclaimed ${item.name}` : item.name,
            stars: item.stars,
            slot: item.slot,
            description: item.description,
            level,
            maxLevel,
            part,
            ...(copy.reclaimed && { reclaimed: true }),
            kind: kr?.kind ?? null,
            krSet: setId ? { id: setId, name: KR_SETS[setId]?.name ?? setId, tier: kr?.tier ?? 0 } : null,
            classes: kr ? [...kr.classes] : item.class ? [item.class] : [],
            icon: kr?.icon ?? null,
            options: optionViews(item, copy),
            runes: runes.map((id) => (id ? socketView(id, blasphemy) : null)),
            ...optionCosts(item, copy),
            // (King's Raid's Technomagic Restoration: a 5★ TechnoMagic piece into a 0★ Reclaimed one.)
            restore: tmRestorable(item, copy) ? { reports: TM_REPORTS.restore, points: restorePrice(), mainAfter: copyMainStat(item, { ...copy, level: 0, reclaimed: true }) } : null,
            setBonuses: bonuses,
            locked: copy.locked === true,
            sell: kept.has(copy._id) || copy.locked === true ? null : itemSellPrice(item),
            sellLocked: kept.has(copy._id) || copy.locked !== true ? null : itemSellPrice(item),
            ...(heroOnly(item) && { salvage: itemSalvage(item) }),
            ...(tmStoneClass(item) && { salvageStones: { class: tmStoneClass(item), count: tmSalvageStones(copy.reclaimed === true) } }),
            ...(isTmPiece(item) && kr?.set && { salvageCrystals: { set: kr.set, count: tmSalvageCrystals(copy.reclaimed === true) }, rerollCrystals: kr.set, ...(kr.unique && { rerollUniqueCrystals: TM_CRYSTALS.skillReroll }) }),
            effects: [...heroItemLines(item, level, copy.tmPotentials, copy.options, runes), ...runes.flatMap((id) => (isBlasphemyRef(id) ? (blasphemyRuneView(id, blasphemy)?.lines.slice(0, 1) ?? []) : []))],
            mainStat: copyMainStat(item, { ...copy, level }),
            setEffect: tmBonus ? { pieces: tmBonus.pieces, text: tmBonus.text, active: lit.get(copy._id)?.set ?? false } : null,
            additional: kr?.unique ? tmSkillLine(copy.tmSkill) : null,
            rerolled: kr?.unique ? tmSkillLine(copy.tmSkillPending) : null,
            rerolledOption: rerolledOptionView(item, copy),
            additionalActive: lit.get(copy._id)?.additional ?? false,
            skill: kr?.unique ? (copy.tmSkill ?? null) : null,
            class: item.class ?? (kr && kr.classes.length === 1 ? kr.classes[0] : null),
            heroOnly: heroOnly(item),
            uniqueWeapon: item.uniqueWeapon ?? null,
            uniqueTreasure: item.uniqueTreasure ? { hero: item.uniqueTreasure.hero, skill: item.uniqueTreasure.skill } : null,
            hero: hero ?? null,
            refine: { blocked: null, cost: null, spare: null, after: null },
        };
        const { to, ...refine } = refineState(copy._id, sameItem.get(copy.itemId) ?? [], item, kept, member?.points ?? 0, member?.stones ?? {});
        view.refine = {
            ...refine,
            after: to === null ? null : heroItemLines(item, to, copy.tmPotentials, copy.options, runes),
            mainAfter: to === null ? null : copyMainStat(item, { ...copy, level: to }),
        };
        list.push(view);
        pieces.set(copy._id, {
            view,
            piece: { item, level, ...(item.uniqueTreasure && copy.tmPotentials && { potentials: copy.tmPotentials }), ...(copy.options && { options: copy.options }), runes, ...(copy.reclaimed && { reclaimed: true }), ...(runes.some(isBlasphemyRef) && { blasphemy: blasphemyMain(runes, blasphemy) }) },
        });
    }
    // Best first: the unique weapons, then King's Raid's gear by tier (TechnoMagic gear's above the dragon sets'), the unique treasures, the artifacts.
    const rank = (copy) => (copy.uniqueWeapon !== null ? 20 : copy.uniqueTreasure !== null ? 4 : copy.part === 'artifact' ? 3 : (copy.krSet?.tier ?? 0) + 5);
    list.sort((a, b) => rank(b) - rank(a) || b.level - a.level || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const heroes = HEROES.map((hero) => {
        const doc = member?.heroes?.[hero.id];
        const equipped = {};
        const on = [];
        const skilled = [];
        // (Each unique treasure once: a second copy of one isn't worn. Its main treasure's effect, when it is one.)
        const treasures = new Set();
        let main = null;
        let artifact = null;
        let underUt = false;
        for (const slot of HERO_SLOTS) {
            const found = pieces.get(doc?.equipment?.[slot] ?? '');
            // (A sub treasure only under a main one that is a unique treasure: the treasure slot comes first.)
            const fits = found !== undefined && fitsSlot(found.piece.item, slot) && found.view.hero === hero.id && wieldedBy(found.piece.item, hero.id) && (underUt || !SIDE_SLOTS.includes(slot)) && countsOnce(found.piece.item, treasures);
            if (fits && slot === 'treasure' && found.piece.item.uniqueTreasure)
                underUt = true;
            equipped[slot] = fits ? found.view.id : null;
            if (fits)
                on.push(slot === 'treasure' ? { ...found.piece, main: true } : found.piece);
            if (fits)
                skilled.push({ item: found.piece.item, ...(found.view.skill !== null && { skill: found.view.skill }) });
            const ut = fits && slot === 'treasure' ? found.piece.item.uniqueTreasure : undefined;
            const effect = ut && found ? uniqueTreasureText(hero.id, ut.skill, treasureTier(found.piece.level)) : null;
            if (ut && found && effect)
                main = { name: effect.name, skill: ut.skill, tier: treasureTier(found.piece.level), text: effect.text };
            if (fits && found.piece.item.kr?.part === 'artifact') {
                const tier = starsOf(found.piece.item, found.piece.level);
                artifact = { name: found.piece.item.name, tier, text: ARTIFACT_TEXT.get(found.piece.item.id)?.[tier] ?? '' };
            }
        }
        const shares = heroBonus(on, hero.class, hero.id);
        const bonus = Object.fromEntries(HERO_STAT_IDS.map((stat) => [stat, raidValue(stat, shares[stat])]));
        const set = heroSet(on, hero.class);
        const skills = heroSkills(skilled, hero.class);
        const perks = keptPerks(doc?.perks, doc?.transcend, doc?.scrollTp);
        // (Its other pages' perks as they're kept too, the one in use's `perks`.)
        const pageCount = perkPageCount(doc?.perkPagesOwned);
        const active = activePerkPage(doc?.perkPage, doc?.perkPagesOwned);
        const pages = Array.from({ length: pageCount }, (_, i) => (i + 1 === active ? perks : keptPerks(doc?.perkPages?.[i + 1] ?? [], doc?.transcend, doc?.scrollTp)));
        const sets = [...setCounts(on, hero.class)].map(([id, count]) => ({ id, name: KR_SETS[id]?.name ?? id, pieces: count, bonuses: setBonusLines(id, hero.class, count) }));
        return {
            id: hero.id,
            name: hero.name,
            class: hero.class,
            deals: hero.deals,
            price: CONFIG.hero.price,
            owned: doc !== undefined,
            equipped,
            bonus,
            set: set && { id: set.set, pieces: set.pieces, active: activeSet(set) !== null },
            sets,
            artifact,
            skills,
            totals: [...heroStatLines(shares), ...setLines(set, hero.class, on), ...skillLines(skills)],
            perks,
            perkPages: { active, pages, next: pageCount < PERK_PAGES_MAX ? perkPagePrice(pageCount + 1, CONFIG.hero) : null },
            treasure: main,
            perkEffects: perkLines(hero.id, perks),
            transcend: { level: transcendLevel(doc?.transcend), points: transcendPoints(doc?.transcend, doc?.scrollTp), scrolls: scrollPoints(doc?.scrollTp), next: transcendCost(hero.class, doc?.transcend) },
            abilities: [...hero.abilities],
            outfit: hero.outfits[wornSkin(hero.id, doc)] ?? hero.outfits[0],
        };
    });
    const essences = Object.fromEntries(ESSENCES.map((id) => [id, member?.essences?.[id] ?? 0]));
    const stones = Object.fromEntries(RAID_CLASS_IDS.map((id) => [id, member?.stones?.[id] ?? 0]));
    const crystals = Object.fromEntries(KR_TM_SETS.map((id) => [id, member?.crystals?.[id] ?? 0]));
    return { heroes, copies: list, balance: member?.points ?? 0, runes: runeStacks(member?.runes), runeFragments: member?.runeFragments ?? 0, runeKeepPrice: runeKeepPrice(), gems: member?.gems ?? 0, essences, stones, crystals, reports: member?.reports ?? 0, tpScrolls: member?.tpScrolls ?? 0, craft: { tm: structuredClone(CONFIG.craft.tm), runes: { ...CONFIG.craft.runes }, tpScroll: CONFIG.craft.tpScroll }, autoSalvage: autoSalvageOf(member), lootBoxes: lootStacks(member?.lootBoxes), lootOpenMost: LOOT_OPEN_MOST, loadouts: { slots: heroLoadoutViews(member, new Set(list.map((copy) => copy.id))), next: nextHeroLoadoutPrice(member, CONFIG.hero.loadoutPrice) } };
}
async function load(guildId, userId) {
    const { items, members } = collections();
    const [copies, member] = await Promise.all([items.find({ guildId, userId }).toArray(), members.findOne({ guildId, userId })]);
    return heroesView(copies, member);
}
/**
 * The ids of the copies the heroes' view after a change to `copyId` needs, besides their other copies of its item (refineState's):
 * it, and every copy they or their heroes wear or a loadout keeps (a hero's sets, effects and totals, and the loadouts, count those).
 */
export const nearCopyIds = (member, copyId) => [...new Set([copyId, ...equippedCopyIds(member?.equipment), ...keptCopyIds(member)])];
/**
 * The heroes' view after a change to a copy of `itemId`, from the copies it needs (nearCopyIds's and that item's) and the member:
 * HeroesView, with only that item's copies (the others' refines need their own item's spares, not loaded).
 */
export function heroesChange(copies, member, itemId) {
    const { copies: every, ...view } = heroesView(copies, member);
    return { ...view, changed: every.filter((copy) => copy.itemId === itemId) };
}
/** Their heroes after a change to their copy `copyId`, from only the copies it could have changed (not every one they own). */
async function loadChange(guildId, userId, copyId) {
    const { items, members } = collections();
    const [member, copy] = await Promise.all([members.findOne({ guildId, userId }), items.findOne({ guildId, userId, _id: copyId }, { projection: { itemId: 1 } })]);
    const near = { _id: { $in: nearCopyIds(member, copyId) } };
    const copies = await items.find({ guildId, userId, ...(copy ? { $or: [near, { itemId: copy.itemId }] } : near) }).toArray();
    return heroesChange(copies, member, copy?.itemId ?? '');
}
export const heroStore = {
    view: load,
    owners: async (guildId, limit) => {
        const docs = await collections()
            .members.find({ guildId, heroes: { $exists: true } }, { projection: { userId: 1, heroes: 1 } })
            .toArray();
        return docs
            .map((doc) => ({ userId: doc.userId, heroes: Object.keys(doc.heroes ?? {}).filter((id) => HEROES.some((hero) => hero.id === id)).length }))
            .filter((owner) => owner.heroes > 0)
            .sort((a, b) => b.heroes - a.heroes || a.userId.localeCompare(b.userId))
            .slice(0, limit);
    },
    buy: async (guildId, userId, id) => {
        const result = await buyHero(guildId, userId, id);
        return result.ok ? load(guildId, userId) : result.reason;
    },
    starter: async (guildId, userId) => {
        const result = await grantStarterHero(guildId, userId);
        return result.ok ? load(guildId, userId) : result.reason;
    },
    equip: async (guildId, userId, hero, slot, copy) => {
        const result = await equipHero(guildId, userId, hero, slot, copy);
        return result.ok ? load(guildId, userId) : result.reason;
    },
    unequip: async (guildId, userId, hero, slot) => ((await unequipHero(guildId, userId, hero, slot)) ? load(guildId, userId) : 'not_found'),
    perks: async (guildId, userId, hero, perks) => {
        const result = await pickHeroPerks(guildId, userId, hero, perks);
        return result.ok ? load(guildId, userId) : result.reason;
    },
    perkPage: async (guildId, userId, hero, page) => {
        const result = await switchPerkPage(guildId, userId, hero, page);
        return result.ok ? load(guildId, userId) : result.reason;
    },
    buyPerkPage: async (guildId, userId, hero, page) => {
        const result = await buyPerkPage(guildId, userId, hero, page);
        return result.ok ? load(guildId, userId) : result.reason;
    },
    transcend: async (guildId, userId, hero) => {
        const result = await transcendHero(guildId, userId, hero);
        return result.ok ? load(guildId, userId) : result.reason;
    },
    refine: async (guildId, userId, copy) => {
        const result = await gearStore.refine(guildId, userId, copy, null);
        return result === 'ok' ? load(guildId, userId) : result;
    },
    rune: async (guildId, userId, copy, socket, rune) => {
        const result = rune === null ? await unsocketRune(guildId, userId, copy, socket) : await socketRune(guildId, userId, copy, socket, rune);
        return result.ok ? load(guildId, userId) : result.reason;
    },
    reroll: async (guildId, userId, copy, option) => {
        const result = await rerollOption(guildId, userId, copy, option);
        return result.ok ? loadChange(guildId, userId, copy) : result.reason;
    },
    keep: async (guildId, userId, copy, keep, option) => {
        const result = option === 'unique' ? await keepTmSkill(guildId, userId, copy, keep) : await keepOption(guildId, userId, copy, keep, option);
        return result.ok ? loadChange(guildId, userId, copy) : result.reason;
    },
    upgrade: async (guildId, userId, copy, option) => {
        const result = await upgradeOption(guildId, userId, copy, option);
        return result.ok ? loadChange(guildId, userId, copy) : result.reason;
    },
    restore: async (guildId, userId, copy) => {
        const result = await restoreTmPiece(guildId, userId, copy);
        return result.ok ? loadChange(guildId, userId, copy) : result.reason;
    },
    sell: (guildId, userId, copies, locked, salvage) => gearStore.sell(guildId, userId, copies, locked, salvage),
    lock: (guildId, userId, copy, locked) => gearStore.lock(guildId, userId, copy, locked),
    autoSalvage: async (guildId, userId, rule) => {
        await setAutoSalvage(guildId, userId, rule);
        return load(guildId, userId);
    },
    craft: async (guildId, userId, set, kind, part, cls, accessory) => {
        const result = await craftTmPiece(guildId, userId, set, kind, part, cls, accessory);
        if (!result.ok)
            return result.reason;
        const { find } = result;
        return { ...(await load(guildId, userId)), crafted: { copy: find.copy ?? '', name: find.reclaimed ? `Reclaimed ${find.item.name}` : find.item.name } };
    },
    craftScrolls: async (guildId, userId, set, count) => {
        const result = await craftTpScrolls(guildId, userId, set, count);
        // (The route checks the count: 'bad_count' doesn't come.)
        return result.ok ? load(guildId, userId) : 'no_crystals';
    },
    scroll: async (guildId, userId, hero) => {
        const result = await useTpScroll(guildId, userId, hero);
        return result.ok ? load(guildId, userId) : result.reason;
    },
    openBox: async (guildId, userId, box, count) => {
        if (!LOOT_BOXES_BY_ID.has(box))
            return 'not_found';
        const opened = await openLootBoxes(guildId, userId, box, count);
        return typeof opened === 'string' ? opened : { ...(await load(guildId, userId)), opened };
    },
    loadoutSave: async (guildId, userId, hero, number) => {
        const result = await saveHeroLoadout(guildId, userId, hero, number);
        return result.ok ? load(guildId, userId) : result.reason;
    },
    loadoutEquip: async (guildId, userId, hero, number) => {
        const result = await equipHeroLoadout(guildId, userId, hero, number);
        return result.ok ? load(guildId, userId) : result.reason;
    },
    loadoutReset: async (guildId, userId, number) => {
        const result = await resetHeroLoadout(guildId, userId, number);
        return result.ok ? load(guildId, userId) : result.reason;
    },
    loadoutName: async (guildId, userId, number, name) => {
        const result = await nameHeroLoadout(guildId, userId, number, name);
        return result.ok ? load(guildId, userId) : result.reason;
    },
    loadoutBuy: async (guildId, userId) => {
        const result = await buyHeroLoadout(guildId, userId);
        return result.ok ? load(guildId, userId) : result.reason;
    },
};
//# sourceMappingURL=heroes.js.map