import { randomBytes } from 'node:crypto';
import { CONFIG } from '../config.js';
import { HEROES_BY_ID } from '../data/heroes.js';
import { keptPerks, transcendLevel } from '../data/transcend.js';
import { collections } from '../db.js';
import { raidGear } from '../lib/game/heroes.js';
import { dragonClearGems, tmClearGems, tmCrystalDrops, tmDropCount } from '../constants/technomagic.js';
import { tmSetOfBoss } from '../data/tm-sets.js';
import { dragonPay, isDragon, rollDragonEssences } from '../lib/game/dragon.js';
import { rollArtifact, rollDragonPieces, rollReclaimed, tmCraftPool, rollRunes, rollTmDrop, rollTmReports, rollTmSkill, rollTmStones, SIM_VERSION, TM_BOSS } from '../lib/game/technomagic.js';
import { rollKrOptions } from '../data/kr-gear.js';
import { ensureMember, giveGems, newCopy } from './economy/index.js';
import { loadAutoSalvage, salvageGives, salvagesDrop } from './items/salvage.js';
import { recordLedger } from './economy/shared.js';
import { wornSkin } from './hero-outfits.js';
import { isDivine } from '../lib/game/divine.js';
import { abortDivine, enterDivine, finishDivine } from './divine.js';
/*
 * TechnoMagic Raid runs in the database (the rules are lib/game/technomagic.ts's; the rooms they are fought
 * in, web/games/technomagic/). A run is begun for everyone in a room as its fight starts: each player's
 * heroes in the gear they wear then. The bot runs the fight itself; a win gives each player in it (however many
 * runs they have won that day: there is no daily limit) TechnoMagic items (TM_DROP_COUNTS, by the stage), each copy with an additional skill and its potentials rolled for it
 * (ItemCopyDoc.tmSkill, tmPotentials; an armor's main stat's DEF too, tmArmorDef), and `hero.winPoints` points.
 * The Dragon Raid's runs are kept the same way (their boss a dragon: lib/game/dragon.ts), and a win gives each player hero
 * gear (raid items: DRAGON_DROPS), points and hero essences of its dragon's kinds, more at the higher stages (`dragon.*`), and
 * komaGems for each stage up to it they hadn't cleared before (DRAGON_GEMS). A drop of hero gear their salvage rule takes
 * (./items/salvage.ts) is salvaged for komaDust as it drops, in its place.
 * A dragon's run is in its Normal or Hard mode (TmRunDoc.mode), each with stages of its own, opened apart.
 * The Divine Punishment Raid's runs too (their boss one of lib/game/divine.ts's): entering checks the opening and takes what it uses
 * (services/divine.ts enterDivine), and a run over pays its rows (finishDivine), its stage the opening's Infinite level.
 */
/** The heroes a member owns (that still exist), by id, with how far each is transcended (0 to TRANSCEND_MAX). */
export async function ownedHeroes(guildId, userId) {
    const member = await collections().members.findOne({ guildId, userId }, { projection: { heroes: 1 } });
    return new Map(Object.entries(member?.heroes ?? {}).flatMap(([id, hero]) => (HEROES_BY_ID.has(id) ? [[id, transcendLevel(hero?.transcend)]] : [])));
}
/** The skin each of a member's heroes is in, by id (the outfit it wears: services/hero-outfits.ts); one in its own look is left out. */
export async function wornSkins(guildId, userId) {
    const member = await collections().members.findOne({ guildId, userId }, { projection: { heroes: 1 } });
    return new Map(Object.entries(member?.heroes ?? {}).flatMap(([id, hero]) => (HEROES_BY_ID.has(id) && wornSkin(id, hero) > 0 ? [[id, wornSkin(id, hero)]] : [])));
}
/** The highest stage a member has won a run against `boss` at, in `mode` (0: none yet). A run with no mode is a Hard one (every run from before Normal). */
export async function clearedStage(guildId, userId, boss = TM_BOSS, mode = 'hard') {
    const best = await collections().tmRuns.findOne({ guildId, userId, boss, result: 'won', mode: mode === 'normal' ? 'normal' : { $ne: 'normal' } }, { sort: { stage: -1 }, projection: { stage: 1 } });
    return best?.stage ?? 0;
}
/** The highest stage a member has won against `boss` in each mode (0: none yet). */
export async function clearedStages(guildId, userId, boss = TM_BOSS) {
    const [hard, normal] = await Promise.all([clearedStage(guildId, userId, boss, 'hard'), isDragon(boss) ? clearedStage(guildId, userId, boss, 'normal') : 0]);
    return { hard, normal };
}
/**
 * Begins a room's run against `boss` (in `mode`) at `stage` for each of its players with their `heroes` (the lineup's): reads
 * what each owns and their gear, and keeps a run for each. A Divine Punishment boss's: each enters it first (`divine`: the shards
 * they bring; services/divine.ts enterDivine, which throws a DivineRefusal when they can't), its stage the opening's level.
 */
export async function beginRun(guildId, stage, players, now = new Date(), boss = TM_BOSS, mode = 'hard', divine) {
    const { items, members, tmRuns } = collections();
    const run = { id: randomBytes(12).toString('base64url'), boss, mode, seed: randomBytes(4).readUInt32LE(0), players: new Map() };
    for (const { userId, heroes } of players) {
        if (isDivine(boss)) {
            run.divine = await enterDivine(guildId, userId, boss, divine ?? {}, now);
            stage = run.divine.level ?? 1;
        }
        const [member, copies] = await Promise.all([
            members.findOne({ guildId, userId }, { projection: { heroes: 1, blasphemy: 1 } }),
            items.find({ guildId, userId }).toArray(),
        ]);
        const owned = new Set(Object.keys(member?.heroes ?? {}).filter((id) => HEROES_BY_ID.has(id)));
        const loadouts = raidGear(copies, member);
        const gear = new Map([...owned].map((id) => [id, { ...(loadouts.get(id)?.bonus ?? {}) }]));
        const sets = new Map([...owned].map((id) => [id, loadouts.get(id)?.set ?? null]));
        const uws = new Map([...owned].map((id) => [id, loadouts.get(id)?.uw ?? null]));
        const uts = new Map([...owned].map((id) => [id, loadouts.get(id)?.ut ?? null]));
        const artifacts = new Map([...owned].map((id) => [id, loadouts.get(id)?.artifact ?? null]));
        const skills = new Map([...owned].map((id) => [id, loadouts.get(id)?.skills ?? []]));
        // Its transcendence perks: those picked, as far as it is transcended.
        const perks = new Map([...owned].map((id) => [id, keptPerks(member?.heroes?.[id]?.perks, member?.heroes?.[id]?.transcend, member?.heroes?.[id]?.scrollTp)]));
        // Each in the outfit it wears (whatever skin the page asked for).
        const skins = new Map([...owned].map((id) => [id, wornSkin(id, member?.heroes?.[id])]));
        const blasphemy = new Map([...owned].map((id) => [id, loadouts.get(id)?.blasphemy ?? []]));
        run.players.set(userId, { owned, gear, sets, uws, uts, artifacts, skills, perks, skins, blasphemy });
        const doc = {
            _id: `${run.id}:${userId}`,
            run: run.id,
            guildId,
            userId,
            boss,
            ...(mode === 'normal' && { mode }),
            seed: run.seed,
            stage,
            heroes: heroes.filter((hero) => owned.has(hero.id)).map((hero) => ({ ...hero, skin: skins.get(hero.id) ?? 0, gear: gear.get(hero.id) ?? {}, set: sets.get(hero.id) ?? null, uw: uws.get(hero.id) ?? null, ut: uts.get(hero.id) ?? null, artifact: artifacts.get(hero.id) ?? null, skills: skills.get(hero.id) ?? [], perks: perks.get(hero.id) ?? [] })),
            version: SIM_VERSION,
            startedAt: now,
            ...(run.divine && { divine: { group: run.divine.group, ...(run.divine.level !== undefined && { level: run.divine.level }), ...(run.divine.cleared && { cleared: [...run.divine.cleared] }), shard: run.divine.shard ?? null, empty: run.divine.empty ?? null } }),
        };
        await tmRuns.insertOne(doc);
    }
    return run;
}
/**
 * A piece found: a copy of it, with its options and (TechnoMagic gear) its additional skill rolled for it, Reclaimed with
 * `reclaimed`; or, one their `salvage` rule takes, its komaDust in its place (what it rolled is still said, for the end screen to
 * show what went). A Reclaimed one is never salvaged.
 */
async function findPiece(guildId, userId, item, salvage = null, reclaimed = false) {
    const grant = newGrant();
    const find = rollPiece(guildId, userId, item, grant, salvage, reclaimed);
    await giveGrant(guildId, userId, grant);
    return find;
}
/** findPiece's piece, rolled into `grant` (given with it). */
function rollPiece(guildId, userId, item, grant, salvage = null, reclaimed = false) {
    const options = item.kr ? rollKrOptions(item.kr) : [];
    const skill = item.kr?.unique ? rollTmSkill() : null;
    const found = { item, skill, potentials: [], ...(options.length > 0 && { options }), ...(reclaimed && { reclaimed }) };
    if (!reclaimed && salvagesDrop(salvage, item)) {
        const { dust, stones, crystals, inc } = salvageGives(item);
        for (const [field, n] of Object.entries(inc))
            addTo(grant, field, n);
        if (dust > 0)
            grant.ledger.push({ guildId, userId, delta: 0, powderDelta: dust, reason: 'salvage', itemId: item.id });
        return { ...found, salvaged: dust, ...(stones > 0 && { salvagedStones: stones }), ...(crystals > 0 && { salvagedCrystals: crystals }) };
    }
    const copy = { ...newCopy(guildId, userId, item.id, { options }), ...(skill && { tmSkill: skill }), ...(reclaimed && { reclaimed }) };
    grant.copies.push(copy);
    return { ...found, copy: copy._id };
}
const newGrant = () => ({ inc: {}, copies: [], ledger: [] });
/** Adds `n` of `field` (a member's count) to `grant`. */
function addTo(grant, field, n) {
    if (n > 0)
        grant.inc[field] = (grant.inc[field] ?? 0) + n;
}
/** Gives a member what `grant` gathered: its copies, its counts and its ledger lines, a write each (a round trip each, however many wins). */
async function giveGrant(guildId, userId, grant) {
    if (grant.copies.length > 0)
        await collections().items.insertMany(grant.copies);
    if (Object.keys(grant.inc).length > 0) {
        await ensureMember(guildId, userId);
        await collections().members.updateOne({ guildId, userId }, { $inc: grant.inc });
    }
    await recordLedger(grant.ledger);
}
/** A win's runes and points (`reason`: whose), into `grant`. */
function grantWin(guildId, userId, grant, runes, points, reason) {
    for (const id of runes)
        addTo(grant, `runes.${id}`, 1);
    addTo(grant, 'points', points);
    if (points > 0)
        grant.ledger.push({ guildId, userId, delta: points, reason });
}
/**
 * A room's run is over (`result`, after `ticks` steps): a win at `stage` pays each of its players (payTmWin, or a dragon's:
 * payDragonWin); those who left it (`forfeited`) get nothing. `boxed` (a background raid's: ./tm-batches.ts): a win pays only
 * its first clears' komaGems (payFirstClears), the rest its Dispatch Battle Loot's (./loot-boxes.ts). A Divine Punishment run's
 * is services/divine.ts finishDivine's, won or lost (a karma run's Empty Shards come back as they didn't fill; `karma` its outcome).
 * Returns what each got.
 */
export async function finishRun(guildId, run, stage, result, ticks, forfeited = new Set(), now = new Date(), boxed = false, karma = null) {
    const found = new Map();
    const dragon = isDragon(run.boss);
    for (const userId of run.players.keys()) {
        // One who left it (forfeited) is paid nothing, and it counts as lost for them (it opens no stage).
        const paid = result === 'won' && !forfeited.has(userId);
        // (The classes of the heroes they brought: whose Upgrade Stones a TechnoMagic Raid win gives.)
        const classes = [...new Set([...(run.players.get(userId)?.gear.keys() ?? [])].flatMap((id) => HEROES_BY_ID.get(id)?.class ?? []))];
        const divine = run.divine && isDivine(run.boss) ? await finishDivine(guildId, userId, run.boss, run.divine, paid, karma, now) : null;
        const won = divine
            ? { finds: [], points: 0, divine, ...(divine.runes && { runes: divine.runes }) }
            : !paid
                ? { finds: [], points: 0 }
                : boxed
                    ? await payFirstClears(guildId, userId, run.boss, stage, run.mode)
                    : dragon
                        ? await payDragonWin(guildId, userId, run.boss, stage, run.mode)
                        : await payTmWin(guildId, userId, run.boss, stage, classes);
        found.set(userId, won);
        await collections().tmRuns.updateOne({ _id: `${run.id}:${userId}` }, { $set: { claimedAt: now, result: forfeited.has(userId) ? 'lost' : result, ticks, ...(divine?.karma && { 'divine.karma': divine.karma }), drops: won.finds.filter((find) => find.salvaged === undefined).map(({ item }) => item.id), ...(won.finds.some((find) => find.salvaged !== undefined) && { salvaged: won.finds.flatMap((find) => (find.salvaged === undefined ? [] : [find.item.id])) }), ...(won.runes && { runes: won.runes }), ...(won.essences && { essences: won.essences }), ...(won.gems && { gems: won.gems }) } });
    }
    return found;
}
/** A run begun that was never fought (the sim refused it): a Divine Punishment run's entry given back (services/divine.ts abortDivine), and each kept run marked lost. */
export async function abortRun(guildId, run, now = new Date()) {
    for (const userId of run.players.keys()) {
        if (run.divine)
            await abortDivine(guildId, userId, run.boss, run.divine);
        await collections().tmRuns.updateOne({ _id: `${run.id}:${userId}` }, { $set: { claimedAt: now, result: 'lost', ticks: 0 } });
    }
}
/**
 * A win's first clears alone: komaGems for each stage up to `stage` they hadn't cleared (tmClearGems, a dragon's dragonClearGems:
 * a win clears every stage under it too; this run isn't marked won yet). A background raid's win pays this as it ends, the rest
 * in its Dispatch Battle Loot.
 */
async function payFirstClears(guildId, userId, boss, stage, mode = 'hard') {
    const dragon = isDragon(boss);
    const cleared = await clearedStage(guildId, userId, boss, dragon ? mode : 'hard');
    const gems = dragon ? dragonClearGems(cleared, stage, mode) : tmClearGems(cleared, stage);
    if (gems > 0)
        await giveGems(guildId, userId, gems, dragon ? 'dragon_gems' : 'tm_gems');
    return { finds: [], points: 0, gems, firstClears: Math.max(0, stage - cleared) };
}
/**
 * What `count` of a background raid's Dispatch Battle Loot give (./loot-boxes.ts): each a win at its stage, without first clears
 * (its run paid them as it ended), all given at once. A TechnoMagic Raid box's Upgrade Stones are of any class (its lineup isn't kept).
 */
export async function payLootWins(guildId, userId, boss, stage, mode, count) {
    const salvage = await loadAutoSalvage(guildId, userId);
    const grant = newGrant();
    const wins = Array.from({ length: count }, () => (isDragon(boss) ? rollDragonWin(guildId, userId, boss, stage, mode, salvage, grant) : rollTmWin(guildId, userId, boss, stage, [], salvage, grant)));
    await giveGrant(guildId, userId, grant);
    return wins;
}
/**
 * A TechnoMagic Raid win at `stage`: that stage's pieces of the boss's set (tmDropCount), each copy with its options and its
 * additional skill rolled for it, now and then Reclaimed (rollReclaimed); its runes; now and then an artifact; Upgrade Stones of
 * one of `classes` (the heroes they brought: rollTmStones); its boss's Boss Crystals; now and then Technomagic Experiment
 * Reports (rollTmReports); `hero.winPoints` points; and komaGems for each stage up to it they
 * hadn't cleared (tmClearGems: a win clears every stage under it too; this run isn't marked won yet).
 */
async function payTmWin(guildId, userId, boss, stage, classes = []) {
    const cleared = await clearedStage(guildId, userId, boss);
    const grant = newGrant();
    const won = rollTmWin(guildId, userId, boss, stage, classes, await loadAutoSalvage(guildId, userId), grant);
    await giveGrant(guildId, userId, grant);
    const gems = tmClearGems(cleared, stage);
    if (gems > 0)
        await giveGems(guildId, userId, gems, 'tm_gems');
    return { ...won, gems, firstClears: Math.max(0, stage - cleared) };
}
/** payTmWin's win but its komaGems, rolled into `grant` (given with it). */
function rollTmWin(guildId, userId, boss, stage, classes, salvage, grant) {
    const finds = [];
    for (let n = tmDropCount(stage); n > 0; n--) {
        const item = rollTmDrop(boss);
        if (!item)
            break;
        finds.push(rollPiece(guildId, userId, item, grant, salvage, rollReclaimed(stage)));
    }
    const artifact = rollArtifact(stage);
    if (artifact)
        finds.push(rollPiece(guildId, userId, artifact, grant));
    const runes = rollRunes(stage, false);
    const points = Math.max(0, CONFIG.hero.winPoints);
    grantWin(guildId, userId, grant, runes, points, 'tm_win');
    const stones = rollTmStones(stage, classes);
    if (stones)
        addTo(grant, `stones.${stones.class}`, stones.count);
    // (Its boss's Boss Crystals, more the higher the stage.)
    const set = tmSetOfBoss(boss)?.id;
    const crystals = set ? { set, count: tmCrystalDrops(stage) } : null;
    if (crystals)
        addTo(grant, `crystals.${crystals.set}`, crystals.count);
    // (Now and then Technomagic Experiment Reports, what restoring a piece into a Reclaimed one takes.)
    const reports = rollTmReports(stage);
    addTo(grant, 'reports', reports);
    return { finds, runes, points, ...(stones && { stones }), ...(crystals && crystals.count > 0 && { crystals }), ...(reports > 0 && { reports }) };
}
/**
 * A Dragon Raid win at `stage` against `dragon` (in `mode`): pieces of its set (rollDragonPieces), its runes, its points, its
 * dragon's essences (dragonPay), and komaGems for each stage up to it they hadn't cleared (dragonClearGems: a win clears every
 * stage under it too, as their progress is the highest they have won; this run isn't marked won yet).
 */
async function payDragonWin(guildId, userId, dragon, stage, mode = 'hard') {
    const cleared = await clearedStage(guildId, userId, dragon, mode);
    const grant = newGrant();
    const won = rollDragonWin(guildId, userId, dragon, stage, mode, await loadAutoSalvage(guildId, userId), grant);
    await giveGrant(guildId, userId, grant);
    const gems = dragonClearGems(cleared, stage, mode);
    if (gems > 0)
        await giveGems(guildId, userId, gems, 'dragon_gems');
    return { ...won, gems, firstClears: Math.max(0, stage - cleared) };
}
/** payDragonWin's win but its komaGems, rolled into `grant` (given with it). */
function rollDragonWin(guildId, userId, dragon, stage, mode, salvage, grant) {
    const finds = rollDragonPieces(dragon, stage, undefined, mode).map((item) => rollPiece(guildId, userId, item, grant, salvage));
    const runes = rollRunes(stage, true, undefined, mode);
    const pay = dragonPay(stage, undefined, mode);
    grantWin(guildId, userId, grant, runes, pay.points, 'dragon_win');
    const essences = rollDragonEssences(dragon, pay.essences);
    const given = Object.entries(essences).filter(([, amount]) => (amount ?? 0) > 0);
    for (const [id, amount] of given)
        addTo(grant, `essences.${id}`, amount ?? 0);
    if (given.length > 0)
        grant.ledger.push({ guildId, userId, delta: 0, essenceDelta: Object.fromEntries(given), reason: 'dragon_essences' });
    return { finds, runes, points: pay.points, essences };
}
/**
 * Crafts a piece of TechnoMagic `set` (King's Raid's Valance's Workshop: its price the config's craft.tm): `kind` 'any' any of
 * its pieces, 'part' any class's piece of `part`, 'exact' `cls`'s piece of `part` (an accessory: of `accessory`'s kind alone, with
 * one, at the same price), each as likely, for its price in the set's
 * Boss Crystals and points (both taken at once, or neither). It comes as a drop does, its options and additional skill rolled,
 * now and then Reclaimed; never salvaged. The piece, or why not (nothing was spent).
 */
export async function craftTmPiece(guildId, userId, set, kind, part = null, cls = null, accessory = null, rng = { index: (max) => randomBytes(4).readUInt32LE(0) % max }) {
    const pool = tmCraftPool(set, kind, part, cls, accessory);
    if (pool.length === 0)
        return { ok: false, reason: 'no_piece' };
    const { crystals, points } = CONFIG.craft.tm[kind];
    const { members } = collections();
    const field = `crystals.${set}`;
    await ensureMember(guildId, userId);
    const paid = await members.findOneAndUpdate({ guildId, userId, points: { $gte: points }, [field]: { $gte: crystals } }, { $inc: { points: -points, [field]: -crystals } });
    if (!paid) {
        const member = await members.findOne({ guildId, userId }, { projection: { points: 1, crystals: 1 } });
        return { ok: false, reason: (member?.crystals?.[set] ?? 0) < crystals ? 'no_crystals' : 'too_poor' };
    }
    const item = pool[rng.index(pool.length)];
    try {
        const find = await findPiece(guildId, userId, item, null, rng.index(10_000) < Math.round(CONFIG.craft.reclaimed * 10_000));
        await recordLedger([{ guildId, userId, delta: -points, reason: 'tm_craft', itemId: item.id }]);
        return { ok: true, find };
    }
    catch (err) {
        // (The piece wasn't given: what was paid, given back.)
        await members.updateOne({ guildId, userId }, { $inc: { points, [field]: crystals } }).catch(() => { });
        console.error('Could not give a crafted TechnoMagic piece:', err);
        return { ok: false, reason: 'busy' };
    }
}
//# sourceMappingURL=technomagic.js.map