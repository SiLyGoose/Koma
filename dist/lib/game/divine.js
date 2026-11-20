import { randomInt } from 'node:crypto';
import { BLASPHEMY_STORAGE, KARMA_BONUS } from '../../constants/divine.js';
import { BLASPHEMY_BLOOD, BLASPHEMY_FRACTION, BLASPHEMY_FRAGMENTS, DP_ALIVE_SECONDS, DP_FIXED, DP_KARMA_EXPONENT, DP_KARMA_REWARDS, DP_OPEN, DP_RAID_REWARDS, DP_REWARD_LEVELS, DP_SCALED, DP_SCALED_GROUPS } from '../../data/divine-kr.js';
import { HERO_STAT_IDS } from '../../protocol/heroes.js';
import * as sim from '../../../vendor/technomagic-sim.mjs';
/*
 * King's Raid's Divine Punishment Raid, with no database (services/divine.ts keeps it; web/games/technomagic/ fights it, solo only).
 * Two groups (Apocalypsion, Solenis), each with boss dungeons (side bosses, then the final boss at an Infinite level unlocked for 7
 * days) and a Karma dungeon (endless waves filling Empty Shards). King's Raid's numbers are data/divine-kr.ts's; my defaults
 * constants/divine.ts's. Its fight is the sim's (vendor/technomagic-sim.mjs: DIVINE_INFO, KR_BLASPHEMY, fillShards): until Koma-UI's
 * `yarn sync` brings them, the sim has none of them, so they are read here, each with a fallback (the bosses' list as the contract
 * says it, KR's shard gauges and GetFullFlask, no Runes of Blasphemy), and the rules below take the sim's data as arguments where tests
 * want their own.
 */
/** The sim's exports, any of which a sim from before the Divine Punishment Raid lacks. */
const SIM = sim;
/** The bosses as the contract lists them (the sim's DIVINE_INFO, till it has one): its ids, KR's names, groups, kinds and times (BattleDefine MaxTime, karma's + rage). */
const FALLBACK_INFO = [
    { id: 'dp-temeraire', name: 'Temeraire', group: 'apocalypsion', kind: 'side', time: 180 },
    { id: 'dp-scalaxia', name: 'Scalaxia', group: 'apocalypsion', kind: 'side', time: 300 },
    { id: 'dp-zyrrkinoth', name: 'Zyrrkinoth', group: 'apocalypsion', kind: 'side', time: 300 },
    { id: 'dp-armarta', name: 'Armarta', group: 'apocalypsion', kind: 'side', time: 600 },
    { id: 'apocalypsion', name: 'Apocalypsion', group: 'apocalypsion', kind: 'final', time: 180 },
    { id: 'luciteron', name: 'Luciteron', group: 'solenis', kind: 'side', time: 120 },
    { id: 'altigma', name: 'Altigma', group: 'solenis', kind: 'side', time: 150 },
    { id: 'solenis', name: 'Solenis', group: 'solenis', kind: 'final', time: 300 },
    { id: 'karma-apocalypsion', name: 'Karma Dungeon: Apocalypsion', group: 'apocalypsion', kind: 'karma', time: 130 },
    { id: 'karma-solenis', name: 'Karma Dungeon: Solenis', group: 'solenis', kind: 'karma', time: 100 },
];
/** The Divine Punishment bosses (dungeons), in order. */
export const DIVINE_INFO = SIM.DIVINE_INFO ?? FALLBACK_INFO;
/** The highest Infinite level there is (the sim's: it has stats that far). */
export const DIVINE_LEVELS = SIM.DIVINE_LEVELS ?? 99;
/** The Runes of Blasphemy (King's Raid's 44; none from a sim without them). */
export const KR_BLASPHEMY = SIM.KR_BLASPHEMY ?? [];
/** King's Raid's FlaskGauge by shard tier. */
export const SHARD_GAUGE = SIM.SHARD_GAUGE ?? { 1: 500, 2: 1200, 3: 2200, 4: 4500, 5: 10_000 };
/** King's Raid's GetFullFlask (the sim's fillShards, till it has one): the brought tier first, as many as the gauge fills (at most as many as brought), the rest into free Tier 1. */
export function krFillShards(gauge, empty, gauges = SHARD_GAUGE) {
    const full = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let left = Math.max(0, Math.floor(gauge));
    let used = 0;
    if (empty && empty.count > 0) {
        used = Math.min(Math.floor(empty.count), Math.floor(left / gauges[empty.tier]));
        full[empty.tier] += used;
        left -= used * gauges[empty.tier];
    }
    full[1] += Math.floor(left / gauges[1]);
    return { empty: used, full };
}
/** The sim's fillShards (or King's Raid's, as above, from a sim without it). */
export const fillShards = SIM.fillShards ?? ((gauge, empty) => krFillShards(gauge, empty));
export const DIVINE_GROUPS = ['apocalypsion', 'solenis'];
export const DIVINE_IDS = DIVINE_INFO.map((boss) => boss.id);
export const isDivine = (id) => DIVINE_IDS.includes(id);
export const divineInfo = (id, info = DIVINE_INFO) => info.find((boss) => boss.id === id);
/** A group's dungeons of a kind. */
export const dungeonsOf = (group, kind, info = DIVINE_INFO) => info.filter((boss) => boss.group === group && boss.kind === kind);
/** Apocalypsion's dragons: at most `MOST_DRAGONS` of them cleared in an opening (KR: PunishmentClearDungeonCount < 2, "Up to 2 Dragons can be defeated at a time"). */
export const MOST_DRAGONS = 2;
const defaultRng = { index: (max) => randomInt(0, max) };
/* ---------------------------------------------------------------- openings */
export const ALIVE_MS = DP_ALIVE_SECONDS * 1000;
/** Whether a group's 7-day window is still running at `now` (its clears still count). */
export const windowLive = (boss, now) => !!boss && boss.expires.getTime() > now.getTime();
/** Whether its boss dungeons are open at `now` (unlocked, its final boss not beaten since, its window not over: KR's IsOpen && ExpireTime). */
export const openingOpen = (boss, now) => !!boss && windowLive(boss, now) && boss.open;
/** The boss clears counted for the unlock's price (KR's GetClearCount: 0 once the window is over). */
export const clearsNow = (boss, now) => (boss && windowLive(boss, now) ? boss.clears : 0);
/** What unlocking the boss dungeons costs with `clears` boss clears in the window: KR's OpenStaminaCount plus the first `clears` StaminaIncreaseCount (the last repeats), in zeiucoins. */
export function bossOpenPrice(clears) {
    let price = DP_OPEN.boss;
    for (let i = 0; i < Math.max(0, Math.floor(clears)); i++)
        price += DP_OPEN.increase[Math.min(i, DP_OPEN.increase.length - 1)];
    return price;
}
/** What unlocking a Karma run costs (KR: 3,000 Stamina, in zeiucoins). */
export const KARMA_OPEN_PRICE = DP_OPEN.karma;
/** The highest Infinite level a group's boss dungeons can be unlocked at: the one after the highest cleared (KR: 1 … ClearLevel+1), at most DIVINE_LEVELS. */
export const highestOpenable = (group, levels = DIVINE_LEVELS) => Math.max(1, Math.min(levels, (group?.best ?? 0) + 1));
/**
 * Unlocking a group's boss dungeons at `level` (King's Raid's OpenPunishmentRaid, Boss): its price and the opening it makes. A window
 * still running keeps its start, end and clears (the price climbing with them); one over (or none yet) starts again now, for 7 days,
 * at 0 clears. Refused: an opening already open, or a level not 1 to highestOpenable.
 */
export function openBoss(group, level, now, levels = DIVINE_LEVELS) {
    if (openingOpen(group?.boss, now))
        return 'already_open';
    if (!Number.isInteger(level) || level < 1 || level > highestOpenable(group, levels))
        return 'bad_level';
    const live = windowLive(group?.boss, now) ? group?.boss : undefined;
    const clears = live?.clears ?? 0;
    return {
        price: bossOpenPrice(clears),
        boss: { open: true, level, since: live?.since ?? now, expires: live?.expires ?? new Date(now.getTime() + ALIVE_MS), clears, cleared: [] },
    };
}
/** Unlocking a Karma run (KR's OpenPunishmentRaid, Karma: one run a unlock): its price; refused while one is unlocked and not run yet. */
export const openKarma = (group) => (group?.karma?.open ? 'already_open' : { price: KARMA_OPEN_PRICE });
/** King's Raid's ResetPunishmentRaid: the opening closed ("reset to the pre-unlock state"), its side clears gone, nothing paid back; the window and its clears kept. */
export function resetBoss(group, now) {
    const boss = group?.boss;
    if (!boss || !openingOpen(boss, now))
        return 'not_open';
    return { ...boss, open: false, cleared: [] };
}
/** Why a dungeon can't be entered now (null: it can): its opening not open (a Karma run: none unlocked), a side boss cleared in this opening already, or a third dragon. */
export function enterRefusal(boss, group, now, info = DIVINE_INFO) {
    if (boss.kind === 'karma')
        return group?.karma?.open ? null : 'not_open';
    const opening = group?.boss;
    if (!opening || !openingOpen(opening, now))
        return 'not_open';
    if (boss.kind !== 'side')
        return null;
    if (opening.cleared.includes(boss.id))
        return 'cleared';
    if (boss.group === 'apocalypsion') {
        const dragons = dungeonsOf('apocalypsion', 'side', info).map((one) => one.id);
        if (opening.cleared.filter((id) => dragons.includes(id)).length >= MOST_DRAGONS)
            return 'not_allowed';
    }
    return null;
}
/** A group's state after a win against `boss` (at `level`): a side boss cleared in the opening; the final boss's closes it, counts a clear in the window and raises the best level. */
export function afterWin(boss, group, level) {
    const next = { ...group };
    const opening = group?.boss;
    if (boss.kind === 'side' && opening)
        next.boss = { ...opening, cleared: [...new Set([...opening.cleared, boss.id])] };
    if (boss.kind === 'final') {
        if (opening)
            next.boss = { ...opening, open: false, clears: opening.clears + 1, cleared: [] };
        next.best = Math.max(group?.best ?? 0, level);
    }
    return next;
}
export const noPay = () => ({ blood: {}, fragments: {}, legendary: 0, tickets: 0, empty: {}, full: {} });
const FRAGMENTS = ['doomstone', 'tear', 'fuel', 'engraving'];
/** Adds `n` of a reward key (data/divine-kr.ts's: 'blood.<group>', a fragment, 'legendary', 'ticket', 'empty.<tier>') to `pay`. */
function addKey(pay, key, n) {
    if (n <= 0)
        return;
    const [head, tail] = key.split('.');
    if (head === 'blood' && (tail === 'apocalypsion' || tail === 'solenis'))
        pay.blood[tail] = (pay.blood[tail] ?? 0) + n;
    else if (head === 'empty' && tail)
        pay.empty[tail] = (pay.empty[tail] ?? 0) + n;
    else if (FRAGMENTS.includes(head))
        pay.fragments[head] = (pay.fragments[head] ?? 0) + n;
    else if (head === 'legendary')
        pay.legendary += n;
    else if (head === 'ticket')
        pay.tickets += n;
}
/** A scaled row's value at `level` (past the last tabled, the last's). */
export const scaledAt = (index, level) => {
    const values = DP_SCALED[index]?.values ?? [];
    return values[Math.min(values.length, Math.max(1, Math.floor(level))) - 1] ?? 0;
};
/** A fixed reward row's lines, `times` over. */
export const fixedLines = (row, times = 1) => Object.entries(DP_FIXED[row] ?? {}).map(([key, n]) => ({ key, count: n * times }));
/** A scaled group's lines at `level`: each row's count, or (a ratio row) one by its chance at the level. */
export function scaledLines(group, level) {
    return (DP_SCALED_GROUPS[group] ?? []).flatMap((index) => {
        const row = DP_SCALED[index];
        if (!row)
            return [];
        const value = scaledAt(index, level);
        return [row.ratio ? { key: row.key, count: 1, ratio: value } : { key: row.key, count: value }];
    });
}
/** `lines` into `pay`: each count, and each ratio line one by its chance (rolled in order). */
export function addLines(pay, lines, rng = defaultRng) {
    for (const line of lines)
        addKey(pay, line.key, line.ratio !== undefined ? Number(rng.index(1000) < line.ratio) : line.count);
}
/** What `lines` pay (addLines). */
export function payLines(lines, rng = defaultRng) {
    const pay = noPay();
    addLines(pay, lines, rng);
    return pay;
}
/** A scaled group's rewards at `level` into `pay`: each row's count, or (a ratio row, the Unique Gear Ticket) one by its chance in thousandths. */
export const addScaled = (pay, group, level, rng = defaultRng) => addLines(pay, scaledLines(group, level), rng);
/** A fixed reward row into `pay`, `times` over. */
export const addFixed = (pay, row, times = 1) => addLines(pay, fixedLines(row, times));
/** The PunishmentRaidRewardTable row a side boss's win pays (its Sub row). */
export const sideRow = (boss) => DP_RAID_REWARDS.find((row) => row.kind === 'sub' && row.set.length === 1 && row.set[0] === boss);
/** The Active row a final boss's win pays: the one whose set is exactly it and the side bosses cleared in the opening (KR's GetDataByClearCheckIndices). */
export function finalRow(final, cleared) {
    const set = new Set([final, ...cleared]);
    return DP_RAID_REWARDS.find((row) => row.kind === 'active' && row.set.includes(final) && row.set.length === set.size && row.set.every((id) => set.has(id)));
}
/** A side boss's win's lines at `level`: its Sub row's fixed reward, then its scaled group (KR's 301 for a dragon, 401 for a mid-boss) at the level. */
export function sideLines(boss, level) {
    const row = sideRow(boss);
    return row ? [...fixedLines(row.reward), ...scaledLines(row.group, level)] : [];
}
/** A final boss's win's lines at `level` with `cleared` side bosses in the opening: the Active row for that set, its fixed reward, then its scaled group. */
export function finalLines(final, cleared, level) {
    const row = finalRow(final, cleared);
    return row ? [...fixedLines(row.reward), ...scaledLines(row.group, level)] : [];
}
/** A side boss's win at `level`: its Sub row's fixed reward and its scaled group at the level (sideLines). */
export const sideReward = (boss, level, rng = defaultRng) => payLines(sideLines(boss, level), rng);
/**
 * A final boss's win at `level` with `cleared` side bosses in the opening: the Active row for that set, its fixed reward and its
 * scaled group (Apocalypsion 100/101/102 by dragons cleared 0/1/2: fewer more; Solenis 200/201/202 by mid-bosses cleared: more more),
 * the group's Unique Gear Ticket by its chance at the level (finalLines). (KR's quirk kept: Solenis' fixed rows give Apocalypsion's fragments.)
 */
export const finalReward = (final, cleared, level, rng = defaultRng) => payLines(finalLines(final, cleared, level), rng);
/** The same lines added up by what they give (a ratio line kept apart, with its chance), in the order each first comes: as the Reward List shows them. */
export function sumLines(lines) {
    const out = [];
    for (const line of lines) {
        const same = line.ratio === undefined ? out.find((one) => one.key === line.key && one.ratio === undefined) : undefined;
        if (same)
            same.count += line.count;
        else if (line.ratio !== undefined && line.ratio <= 0)
            continue;
        else
            out.push({ ...line });
    }
    return out.filter((line) => line.count > 0);
}
/** The highest level the Reward List shows: five past the best (KR's ClearLevel + 5), at most the levels its rewards are tabled for. */
export const rewardLevels = (group) => Math.max(1, Math.min(DP_REWARD_LEVELS, (group?.best ?? 0) + 5));
/** The level the Reward List opens at (KR's): the opening's while one is open, else the one after the best. */
export const rewardLevelFirst = (group, now) => Math.min(rewardLevels(group), openingOpen(group?.boss, now) ? (group?.boss?.level ?? 1) : (group?.best ?? 0) + 1);
/** KarmaRewardExponentialTable's factor for wave `wave`: the row with the highest level at or under it (1 below the first). */
export const karmaExponent = (wave) => DP_KARMA_EXPONENT.filter((row) => row.level <= wave).at(-1)?.value ?? 1;
/**
 * How many times its fixed reward a karma run clearing `waves` waves gives (KR: "a certain amount… every time you clear each wave",
 * IsAccumulate): wave 1 worth 1, each next worth the one before times its wave's factor (KarmaRewardExponentialTable: 1.023, 1.09 from
 * wave 21, 0.5 from 31), all added, rounded down. (Inference: KR's server did the maths; the gauge's GetFlaskExp is the same shape.)
 */
export function karmaFragmentCount(waves) {
    let worth = 1;
    let total = 0;
    for (let wave = 1; wave <= Math.floor(waves); wave++) {
        if (wave > 1)
            worth *= karmaExponent(wave);
        total += worth;
    }
    return Math.floor(total + 1e-9);
}
/** The chance (thousandths) a karma run clearing `waves` waves gives bonus Empty Shards (constants/divine.ts KARMA_BONUS: my default). */
export const karmaBonusChance = (waves) => Math.min(KARMA_BONUS.most, KARMA_BONUS.perWave * Math.max(0, Math.floor(waves)));
/** Whether a karma run that ended with `gauge` points counts as won (the contract: at least one Tier 1 shard filled; KR: else "recorded as a fail", no Artifact Pieces). */
export const karmaWon = (gauge) => gauge >= SHARD_GAUGE[1];
/**
 * A karma run's rewards (`outcome`, the sim's), its Empty Shards brought being `empty` and how they filled `fill` (fillShards): its
 * fragment (Doomstone for Apocalypsion, Golem's Fuel for Solenis) for each wave (karmaFragmentCount), the Full Shards filled, and now
 * and then one tier's bonus Empty Shards (KR's bonus row; the chance my default). Nothing when it isn't won (karmaWon).
 */
export function karmaReward(group, outcome, fill, rng = defaultRng) {
    const pay = noPay();
    if (!karmaWon(outcome.gauge))
        return pay;
    addFixed(pay, DP_KARMA_REWARDS[group].fix, karmaFragmentCount(outcome.waves));
    for (const tier of [1, 2, 3, 4, 5])
        if (fill.full[tier] > 0)
            pay.full[String(tier)] = fill.full[tier];
    if (rng.index(1000) < karmaBonusChance(outcome.waves)) {
        const weights = KARMA_BONUS.weights;
        let roll = rng.index(weights.reduce((a, b) => a + b, 0));
        const at = weights.findIndex((weight) => (roll -= weight) < 0);
        const tier = String(2 + Math.max(0, at));
        const n = DP_FIXED[DP_KARMA_REWARDS[group].bonus]?.[`empty.${tier}`] ?? 0;
        if (n > 0)
            pay.empty[tier] = (pay.empty[tier] ?? 0) + n;
    }
    return pay;
}
/* ---------------------------------------------------------------- Runes of Blasphemy */
/** A socketed Rune of Blasphemy in ItemCopyDoc.runes: `bl:<its id>` (the member's BlasphemyCopyDoc), so socket arrays stay strings. */
export const BLASPHEMY_REF = 'bl:';
export const isBlasphemyRef = (id) => typeof id === 'string' && id.startsWith(BLASPHEMY_REF);
export const blasphemyRef = (id) => `${BLASPHEMY_REF}${id}`;
export const blasphemyIdOf = (ref) => ref.slice(BLASPHEMY_REF.length);
/** What crafting one costs with `owned` already (KR's PunishmentRuneItemCountTable[owned]; past 500, the last), beside its ingredient runes, its Legendary rune and a Rune of Void. */
export function blasphemyCost(owned) {
    const at = Math.min(BLASPHEMY_FRAGMENTS.length - 1, Math.max(0, Math.floor(owned)));
    return { fragments: BLASPHEMY_FRAGMENTS[at], blood: BLASPHEMY_BLOOD[at], ingredients: BLASPHEMY_STORAGE.ingredients };
}
/** A line's step: whole units of the row's ExtraSkillFraction (KR: 10, or 1,000 for two of Solenis' Ans), as the sim states its values (the shown ones). */
export const lineStep = (data) => 1 / (BLASPHEMY_FRACTION[data.code] ?? 10);
/** The main stat's step: King's Raid's option values are whole thousandths. */
export const MAIN_STEP = 0.001;
/** A value from `min` to `max` in whole steps of `step`, each as likely. */
export function rollStepped(min, max, step, rng = defaultRng) {
    const steps = Math.max(0, Math.round((max - min) / step));
    return Math.round((min + rng.index(steps + 1) * step) * 1e6) / 1e6;
}
/** A new Rune of Blasphemy of `data`: its main stat and each line rolled in its range (KR's steps). */
export function rollBlasphemy(data, id, now, rng = defaultRng) {
    const step = lineStep(data);
    const lines = data.lines.map((line) => rollStepped(line.min, line.max, step, rng));
    return { id, rune: data.id, main: rollStepped(data.main.min, data.main.max, MAIN_STEP, rng), lines, at: now };
}
/** A unique weapon's three sockets, in order (KR's Weapon_Doh, Weapon_Laz, Weapon_Geb). */
export const UW_SOCKETS = ['doh', 'laz', 'geb'];
export const VOID_SOCKETS = ['doh', 'laz', 'geb', 'oth', 'ans'];
/**
 * The Blasphemy socket a piece's `socket`th socket is (null: none takes one): a unique weapon's three Doh, Laz, Geb; an armor's Oth; a
 * secondary's Ans. A King's Raid weapon piece's sockets take none: the playtest's EquipItemTable gives a piece only a rune count (its
 * rune slot types are the hero's Runehenge's, not a piece's), so nothing says one of them is Doh.
 */
export function blasphemySocketOf(item, socket) {
    if (!Number.isInteger(socket) || socket < 0)
        return null;
    if (item.uniqueWeapon !== undefined)
        return UW_SOCKETS[socket] ?? null;
    if (socket >= (item.kr?.runes ?? 0))
        return null;
    return item.kr?.part === 'armor' ? 'oth' : item.kr?.part === 'secondary' ? 'ans' : null;
}
/** Which of a rune's three lines a hero of a class has (KR's HeroClassMyself: …001 Knight/Warrior, …002 Archer/Mechanic/Assassin, …003 Wizard/Priest). */
export const CLASS_LINE = { knight: 0, warrior: 0, archer: 1, assassin: 1, mechanic: 1, wizard: 2, priest: 2 };
/** A member's Runes of Blasphemy with their data, by socket ref (`bl:<id>`): those whose rune the sim knows. */
export function blasphemyLookup(copies, data = KR_BLASPHEMY) {
    const byId = new Map(data.map((one) => [one.id, one]));
    const out = new Map();
    for (const copy of copies ?? []) {
        const one = byId.get(copy.rune);
        if (one)
            out.set(blasphemyRef(copy.id), { copy, data: one });
    }
    return out;
}
const STAT_IDS = new Set(HERO_STAT_IDS);
/** What the Runes of Blasphemy in a piece's sockets give as gear does (their main stats, shares by stat): the hero's gear bonus. */
export function blasphemyMain(runes, lookup) {
    const out = {};
    if (!lookup)
        return out;
    for (const id of runes ?? []) {
        const on = isBlasphemyRef(id) ? lookup.get(id) : undefined;
        if (!on || !STAT_IDS.has(on.data.main.stat))
            continue;
        const stat = on.data.main.stat;
        out[stat] = (out[stat] ?? 0) + on.copy.main;
    }
    return out;
}
/** The lines a hero of `heroClass` has of the Runes of Blasphemy in a piece's sockets: its class's, with the value rolled (RunHero.blasphemy). */
export function blasphemyLines(runes, lookup, heroClass) {
    if (!lookup)
        return [];
    return (runes ?? []).flatMap((id) => {
        const on = isBlasphemyRef(id) ? lookup.get(id) : undefined;
        const at = CLASS_LINE[heroClass];
        const line = on?.data.lines[at];
        return on && line ? [{ skill: line.skill, value: on.copy.lines[at] }] : [];
    });
}
/** A rune's line in words: its text with the rolled value for {v}. */
export const lineText = (line, value) => line.text.replace(/\{v\}/g, String(value));
//# sourceMappingURL=divine.js.map