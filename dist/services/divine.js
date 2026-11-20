import { randomBytes } from 'node:crypto';
import { BLASPHEMY_STORAGE, DIVINE_SHOP } from '../constants/divine.js';
import { BLASPHEMY_BREAK_FRAGMENTS } from '../data/divine-kr.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { KR_RUNES_BY_ID, rollRuneOfGrade } from '../data/kr-gear.js';
import { collections } from '../db.js';
import { afterWin, blasphemyCost, blasphemyIdOf, blasphemyRef, blasphemySocketOf, divineInfo, enterRefusal, fillShards, isBlasphemyRef, karmaReward, KR_BLASPHEMY, finalReward, noPay, openBoss, openingOpen, openKarma, resetBoss, rollBlasphemy, sideReward, } from '../lib/game/divine.js';
import { socketsOf } from '../lib/game/heroes.js';
import { rollUtOptions } from '../lib/game/technomagic.js';
import { divinePrice, runeKeepPrice } from '../config.js';
import { addCopy } from './economy/gacha.js';
import { ensureMember, recordLedger } from './economy/shared.js';
import { gearChanged } from './items/gear-events.js';
import { selectorItem } from './mail.js';
const fail = (reason) => ({ ok: false, reason });
/** Thrown by enterDivine (a room's begin answers its code). */
export class DivineRefusal extends Error {
    code;
    constructor(code) {
        super(`Divine Punishment run refused: ${code}`);
        this.code = code;
    }
}
/**
 * Writes a group's state as `next`, only if it is still as read (`before`: its revision), with `inc` and `also` (more of the
 * filter: what is paid) beside it. Whether it was written.
 */
async function writeGroup(guildId, userId, group, before, next, inc = {}, also = {}) {
    const rev = before?.rev ?? null;
    const done = await collections().members.updateOne({ guildId, userId, [`divine.${group}.rev`]: rev, ...also }, { $set: { [`divine.${group}`]: { ...next, rev: (before?.rev ?? 0) + 1 } }, ...(Object.keys(inc).length > 0 && { $inc: inc }) });
    return done.modifiedCount > 0;
}
/** Unlocks a group's boss dungeons at `level` (King's Raid's OpenPunishmentRaid) or a Karma run, for its price in zeiucoins (taken with it, or nothing is). */
export async function openDivine(guildId, userId, group, type, level, now = new Date()) {
    const { members } = collections();
    await ensureMember(guildId, userId);
    const member = await members.findOne({ guildId, userId }, { projection: { divine: 1, points: 1 } });
    const state = member?.divine?.[group];
    let next;
    let price;
    if (type === 'boss') {
        const made = openBoss(state, level ?? 1, now);
        if (typeof made === 'string')
            return fail(made);
        next = { ...state, boss: made.boss };
        price = made.price;
    }
    else {
        const made = openKarma(state);
        if (typeof made === 'string')
            return fail(made);
        next = { ...state, karma: { open: true } };
        price = made.price;
    }
    if (!(await writeGroup(guildId, userId, group, state, next, { points: -price }, { points: { $gte: price } }))) {
        const after = await members.findOne({ guildId, userId }, { projection: { points: 1 } });
        return fail((after?.points ?? 0) < price ? 'too_poor' : 'busy');
    }
    await recordLedger([{ guildId, userId, delta: -price, reason: 'divine_open', itemId: `divine:${group}:${type}` }]);
    return { ok: true, value: true };
}
/** King's Raid's ResetPunishmentRaid: the group's boss opening closed (its side clears gone), nothing paid back. */
export async function resetDivine(guildId, userId, group, now = new Date()) {
    const member = await collections().members.findOne({ guildId, userId }, { projection: { divine: 1 } });
    const state = member?.divine?.[group];
    const boss = resetBoss(state, now);
    if (typeof boss === 'string')
        return fail(boss);
    return (await writeGroup(guildId, userId, group, state, { ...state, boss })) ? { ok: true, value: true } : fail('busy');
}
/** Whether a shard pick is one: a tier of `tiers` and a whole count of at least 1 (null: none brought). */
const shardPick = (pick, tiers) => pick && tiers.includes(pick.tier) && Number.isInteger(pick.count) && pick.count >= 1 ? { tier: pick.tier, count: pick.count } : null;
/**
 * A member enters a Divine Punishment dungeon (`boss`, one of DIVINE_INFO's) as a room's run begins: its opening checked
 * (lib/game/divine.ts enterRefusal) and what it takes used up at once: a Karma run, its unlock and the Empty Shards brought (given back
 * at its end as they didn't fill: finishDivine); a boss dungeon, the Full Shards brought (King's Raid's: used up on entering). The
 * run's Divine part (its level the opening's, a final boss's the side bosses cleared), or a DivineRefusal thrown.
 */
export async function enterDivine(guildId, userId, boss, ask = {}, now = new Date()) {
    const info = divineInfo(boss);
    if (!info)
        throw new DivineRefusal('not_open');
    const { members } = collections();
    for (let attempt = 0; attempt < 3; attempt++) {
        const member = await members.findOne({ guildId, userId }, { projection: { divine: 1, shards: 1 } });
        const state = member?.divine?.[info.group];
        const refusal = enterRefusal(info, state, now);
        if (refusal)
            throw new DivineRefusal(refusal);
        if (info.kind === 'karma') {
            const empty = shardPick(ask.empty, [2, 3, 4, 5]);
            const field = empty && `shards.empty.${info.group}.${empty.tier}`;
            const ok = await writeGroup(guildId, userId, info.group, state, { ...state, karma: { open: false } }, field && empty ? { [field]: -empty.count } : {}, field && empty ? { [field]: { $gte: empty.count } } : {});
            if (ok)
                return { group: info.group, empty };
            if (empty && (member?.shards?.empty?.[info.group]?.[String(empty.tier)] ?? 0) < empty.count)
                throw new DivineRefusal('no_shards');
            continue;
        }
        const opening = state?.boss;
        if (!opening)
            throw new DivineRefusal('not_open');
        const shard = shardPick(ask.shard, [1, 2, 3, 4, 5]);
        if (shard) {
            const field = `shards.full.${info.group}.${shard.tier}`;
            const taken = await members.updateOne({ guildId, userId, [field]: { $gte: shard.count } }, { $inc: { [field]: -shard.count } });
            if (taken.modifiedCount === 0)
                throw new DivineRefusal('no_shards');
        }
        return { group: info.group, level: opening.level, ...(info.kind === 'final' && { cleared: [...opening.cleared] }), shard };
    }
    throw new DivineRefusal('busy');
}
/** A run begun but never fought (the sim refused it): what entering took given back (its Karma unlock, its shards). */
export async function abortDivine(guildId, userId, boss, divine) {
    const info = divineInfo(boss);
    if (!info)
        return;
    const inc = {};
    if (divine.empty)
        inc[`shards.empty.${divine.group}.${divine.empty.tier}`] = divine.empty.count;
    if (divine.shard)
        inc[`shards.full.${divine.group}.${divine.shard.tier}`] = divine.shard.count;
    const set = info.kind === 'karma' ? { [`divine.${divine.group}.karma`]: { open: true } } : {};
    if (Object.keys(inc).length > 0 || Object.keys(set).length > 0)
        await collections().members.updateOne({ guildId, userId }, { ...(Object.keys(inc).length > 0 && { $inc: inc }), ...(Object.keys(set).length > 0 && { $set: set }) });
}
/** A pay's counts as the member's $inc (and its Legendary runes rolled, each a random Legendary rune: KR's Mysterious Rune: Legendary). */
export function payInc(group, pay, rng) {
    const inc = {};
    const add = (field, n) => {
        if (n > 0)
            inc[field] = (inc[field] ?? 0) + n;
    };
    for (const [of, n] of Object.entries(pay.blood))
        add(`blood.${of}`, n ?? 0);
    for (const [of, n] of Object.entries(pay.fragments))
        add(`dpFragments.${of}`, n ?? 0);
    for (const [tier, n] of Object.entries(pay.empty))
        add(`shards.empty.${group}.${tier}`, n ?? 0);
    for (const [tier, n] of Object.entries(pay.full))
        add(`shards.full.${group}.${tier}`, n ?? 0);
    add('uniqueTickets', pay.tickets);
    const runes = Array.from({ length: pay.legendary }, () => rollRuneOfGrade(6, rng)).filter((id) => id !== null);
    for (const id of runes)
        add(`runes.${id}`, 1);
    return { inc, runes };
}
/** What a pay says on the fight's end screen. */
const paidView = (group, pay, runes) => ({
    group,
    ...(Object.values(pay.blood).some((n) => (n ?? 0) > 0) && { blood: pay.blood[group] ?? 0 }),
    ...(Object.keys(pay.fragments).length > 0 && { fragments: pay.fragments }),
    ...(Object.keys(pay.empty).length > 0 && { empty: pay.empty }),
    ...(Object.keys(pay.full).length > 0 && { full: pay.full }),
    ...(pay.tickets > 0 && { tickets: pay.tickets }),
    ...(runes.length > 0 && { runes }),
});
/**
 * A member's Divine Punishment run is over (`won`; a karma run's `karma` outcome, the sim's): a karma run pays its fragments, Full
 * Shards and bonus Empty Shards (lib/game/divine.ts karmaReward), its Empty Shards brought that didn't fill given back (all of them,
 * lost); a boss dungeon won pays its rows (sideReward, finalReward at the opening's level) and moves the opening on (afterWin: a side
 * boss cleared; the final boss closes it). What it gave.
 */
export async function finishDivine(guildId, userId, boss, divine, won, karma, now = new Date(), rng) {
    const info = divineInfo(boss);
    const { members } = collections();
    if (!info)
        return { group: divine.group };
    if (info.kind === 'karma') {
        const outcome = karma ?? { waves: 0, gauge: 0 };
        const brought = divine.empty?.count ?? 0;
        const fill = won ? fillShards(outcome.gauge, divine.empty ?? null) : { empty: 0, full: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
        const pay = won ? karmaReward(divine.group, outcome, fill, rng) : noPay();
        const back = Math.max(0, brought - fill.empty);
        const { inc, runes } = payInc(divine.group, pay);
        if (divine.empty && back > 0)
            inc[`shards.empty.${divine.group}.${divine.empty.tier}`] = (inc[`shards.empty.${divine.group}.${divine.empty.tier}`] ?? 0) + back;
        if (Object.keys(inc).length > 0) {
            await ensureMember(guildId, userId);
            await members.updateOne({ guildId, userId }, { $inc: inc });
        }
        return { ...paidView(divine.group, pay, runes), karma: outcome, ...(divine.empty && { emptyUsed: fill.empty, emptyBack: back }) };
    }
    if (!won)
        return { group: divine.group };
    const level = divine.level ?? 1;
    const pay = info.kind === 'side' ? sideReward(info.id, level, rng) : finalReward(info.id, divine.cleared ?? [], level, rng);
    const { inc, runes } = payInc(divine.group, pay);
    await ensureMember(guildId, userId);
    if (Object.keys(inc).length > 0)
        await members.updateOne({ guildId, userId }, { $inc: inc });
    // (The opening moved on, if it is still the one the run was fought in.)
    let closed = false;
    let best;
    for (let attempt = 0; attempt < 3; attempt++) {
        const member = await members.findOne({ guildId, userId }, { projection: { divine: 1 } });
        const state = member?.divine?.[divine.group];
        const same = state?.boss !== undefined && openingOpen(state.boss, now) && state.boss.level === level;
        // (Closed meanwhile, or another level opened since: a side boss's clear is that opening's alone; a final boss's still counts for the best level.)
        if (!same && (info.kind !== 'final' || (state?.best ?? 0) >= level))
            break;
        const next = same ? afterWin(info, state, level) : { ...state, best: Math.max(state?.best ?? 0, level) };
        if (await writeGroup(guildId, userId, divine.group, state, next)) {
            closed = same && info.kind === 'final';
            best = next.best;
            break;
        }
    }
    return { ...paidView(divine.group, pay, runes), ...(closed && { closed }), ...(best !== undefined && { best }) };
}
/** A member's openings and shards, as a Divine Punishment room shows them (web/games/technomagic/room.ts). */
export async function divineState(guildId, userId) {
    const member = await collections().members.findOne({ guildId, userId }, { projection: { divine: 1, shards: 1 } });
    return { ...(member?.divine && { divine: member.divine }), ...(member?.shards && { shards: member.shards }) };
}
/* ---------------------------------------------------------------- shop, artifacts, tickets */
/** Buys `count` Runes of Void of a socket (the config's divine.voidPrice each). */
export async function buyVoidRunes(guildId, userId, socket, count = 1) {
    if (!Number.isInteger(count) || count < 1)
        return fail('not_found');
    const price = divinePrice('voidPrice') * count;
    await ensureMember(guildId, userId);
    const paid = await collections().members.updateOne({ guildId, userId, points: { $gte: price } }, { $inc: { points: -price, [`voidRunes.${socket}`]: count } });
    if (paid.modifiedCount === 0)
        return fail('too_poor');
    await recordLedger([{ guildId, userId, delta: -price, reason: 'divine_void', itemId: `void:${socket}` }]);
    return { ok: true, value: true };
}
/** The artifact each fragment crafts (King's Raid's CraftItemTable 128/129/126/127: ARTIFACT_UNIQUE_1000–1003), the bot's item ids. */
export const FRAGMENT_ARTIFACTS = { doomstone: 'artifact-1000', tear: 'artifact-1001', fuel: 'artifact-1002', engraving: 'artifact-1003' };
/** Crafts a fragment's artifact (a 0★ copy) for DIVINE_SHOP.artifactFragments of it and the config's divine.artifactPrice zeiucoins (KR's 1,000 and 20,000 gold): the copy's id. */
export async function craftDivineArtifact(guildId, userId, fragment) {
    const item = ITEMS_BY_ID.get(FRAGMENT_ARTIFACTS[fragment]);
    if (!item)
        return fail('not_found');
    const { members } = collections();
    const field = `dpFragments.${fragment}`;
    const fragments = DIVINE_SHOP.artifactFragments;
    const points = divinePrice('artifactPrice');
    await ensureMember(guildId, userId);
    const paid = await members.updateOne({ guildId, userId, points: { $gte: points }, [field]: { $gte: fragments } }, { $inc: { points: -points, [field]: -fragments } });
    if (paid.modifiedCount === 0) {
        const member = await members.findOne({ guildId, userId }, { projection: { dpFragments: 1 } });
        return fail((member?.dpFragments?.[fragment] ?? 0) < fragments ? 'no_fragments' : 'too_poor');
    }
    try {
        const { copy } = await addCopy(guildId, userId, item.id);
        await recordLedger([{ guildId, userId, delta: -points, reason: 'divine_artifact', itemId: item.id }]);
        return { ok: true, value: copy._id };
    }
    catch (err) {
        await members.updateOne({ guildId, userId }, { $inc: { points, [field]: fragments } }).catch(() => { });
        console.error('Could not give a crafted Divine Punishment artifact:', err);
        return fail('busy');
    }
}
/** Uses a Unique Gear Ticket (King's Raid's ALL_UNIQUE_SELECT_ITEM_STAR_0_0): a 0★ copy of the unique weapon or treasure picked, as the banner makes them. Its name. */
export async function useUniqueTicket(guildId, userId, of, pick) {
    const item = selectorItem(of, pick);
    if (!item)
        return fail('bad_pick');
    const { members } = collections();
    const used = await members.updateOne({ guildId, userId, uniqueTickets: { $gte: 1 } }, { $inc: { uniqueTickets: -1 } });
    if (used.modifiedCount === 0)
        return fail('no_tickets');
    try {
        await addCopy(guildId, userId, item.id, { ...(item.uniqueTreasure && { tmPotentials: rollUtOptions() }) });
    }
    catch (err) {
        await members.updateOne({ guildId, userId }, { $inc: { uniqueTickets: 1 } }).catch(() => { });
        console.error('Could not give a Unique Gear Ticket’s pick:', err);
        return fail('busy');
    }
    return { ok: true, value: item.name };
}
/* ---------------------------------------------------------------- Runes of Blasphemy */
/** Where each of a member's Runes of Blasphemy is socketed (by its id: the copy and socket), from their copies' sockets. */
export async function socketedBlasphemy(guildId, userId) {
    const copies = await collections()
        .items.find({ guildId, userId, runes: { $regex: '^bl:' } }, { projection: { _id: 1, runes: 1 } })
        .toArray();
    return socketedIn(copies);
}
/** Where each Rune of Blasphemy in `copies`' sockets is, by its id (the first, should two name it). */
export function socketedIn(copies) {
    const out = new Map();
    for (const copy of copies) {
        (copy.runes ?? []).forEach((ref, socket) => {
            if (isBlasphemyRef(ref) && !out.has(blasphemyIdOf(ref)))
                out.set(blasphemyIdOf(ref), { copy: copy._id, socket });
        });
    }
    return out;
}
/** How many Runes of Blasphemy a member's storage holds (BLASPHEMY_STORAGE.base, more once extended). */
export const storageOf = (member) => member?.blasphemySlots ?? BLASPHEMY_STORAGE.base;
/** Why `ingredients` (rune ids → counts) aren't a Rune of Blasphemy's gauge (null: they are): BLASPHEMY_STORAGE.ingredients of Legendary or Velkazar runes in all. */
export function ingredientRefusal(ingredients) {
    let total = 0;
    for (const [id, count] of Object.entries(ingredients)) {
        const rune = KR_RUNES_BY_ID.get(id);
        // (KR's [LEGEND_RUNE, VELKAZAR_RUNE]: grade 6, or a grade 5 that isn't Ancient.)
        if (!rune || !Number.isInteger(count) || count < 1 || !(rune.grade === 6 || (rune.grade === 5 && rune.ancient !== true)))
            return 'bad_material';
        total += count;
    }
    return total === BLASPHEMY_STORAGE.ingredients ? null : 'bad_material';
}
/**
 * Crafts a Rune of Blasphemy (`rune`: KR_BLASPHEMY's id; King's Raid's craft_punishment_rune): its gauge's `ingredients`, a Legendary
 * rune of its main stat (its `legend`), Rune Fragments and its group's Blood by how many they own (blasphemyCost) and a Rune of Void of
 * its socket, all taken at once (or nothing is), its main stat and lines rolled. Storage full: 'storage_full'.
 */
export async function craftBlasphemy(guildId, userId, rune, ingredients, now = new Date(), rng, data = KR_BLASPHEMY) {
    const recipe = data.find((one) => one.id === rune);
    if (!recipe || !KR_RUNES_BY_ID.has(recipe.legend))
        return fail('not_found');
    const bad = ingredientRefusal(ingredients);
    if (bad)
        return fail(bad);
    const { members } = collections();
    await ensureMember(guildId, userId);
    const [member, socketed] = await Promise.all([members.findOne({ guildId, userId }, { projection: { blasphemy: 1, blasphemySlots: 1, runes: 1, runeFragments: 1, blood: 1, voidRunes: 1 } }), socketedBlasphemy(guildId, userId)]);
    const owned = member?.blasphemy ?? [];
    const stored = owned.filter((copy) => !socketed.has(copy.id)).length;
    if (stored >= storageOf(member))
        return fail('storage_full');
    const cost = blasphemyCost(owned.length);
    const runes = { ...ingredients };
    runes[recipe.legend] = (runes[recipe.legend] ?? 0) + 1;
    const made = rollBlasphemy(recipe, randomBytes(9).toString('base64url'), now, rng);
    const filter = {
        guildId,
        userId,
        ...(owned.length === 0 ? { $or: [{ blasphemy: { $exists: false } }, { blasphemy: { $size: 0 } }] } : { blasphemy: { $size: owned.length } }),
        runeFragments: { $gte: cost.fragments },
        [`blood.${recipe.group}`]: { $gte: cost.blood },
        [`voidRunes.${recipe.socket}`]: { $gte: 1 },
        ...Object.fromEntries(Object.entries(runes).map(([id, n]) => [`runes.${id}`, { $gte: n }])),
    };
    const inc = { runeFragments: -cost.fragments, [`blood.${recipe.group}`]: -cost.blood, [`voidRunes.${recipe.socket}`]: -1, ...Object.fromEntries(Object.entries(runes).map(([id, n]) => [`runes.${id}`, -n])) };
    const done = await members.updateOne(filter, { $inc: inc, $push: { blasphemy: made } });
    if (done.modifiedCount > 0)
        return { ok: true, value: made };
    if (Object.entries(runes).some(([id, n]) => (member?.runes?.[id] ?? 0) < n))
        return fail('no_rune');
    if ((member?.runeFragments ?? 0) < cost.fragments)
        return fail('no_fragments');
    if ((member?.blood?.[recipe.group] ?? 0) < cost.blood)
        return fail('no_blood');
    if ((member?.voidRunes?.[recipe.socket] ?? 0) < 1)
        return fail('no_void');
    return fail('busy');
}
/** Breaks a Rune of Blasphemy in storage for BLASPHEMY_BREAK_FRAGMENTS Rune Fragments (KR's PunishmentRuneItemBreakTable). One in a socket: 'socketed' (break it where it is). */
export async function breakBlasphemy(guildId, userId, id) {
    const { members } = collections();
    const socketed = await socketedBlasphemy(guildId, userId);
    if (socketed.has(id))
        return fail('socketed');
    const done = await members.updateOne({ guildId, userId, 'blasphemy.id': id }, { $pull: { blasphemy: { id } }, $inc: { runeFragments: BLASPHEMY_BREAK_FRAGMENTS } });
    return done.modifiedCount > 0 ? { ok: true, value: BLASPHEMY_BREAK_FRAGMENTS } : fail('not_found');
}
/** Breaks the Rune of Blasphemy in a copy's `socket`th socket where it is (services/runes.ts breakSocketedRune's, for `bl:` ones). */
export async function breakSocketedBlasphemy(guildId, userId, copyId, socket) {
    const { items, members } = collections();
    const copy = await items.findOne({ guildId, userId, _id: copyId });
    const item = copy ? ITEMS_BY_ID.get(copy.itemId) : undefined;
    if (!copy || !item)
        return fail('not_found');
    const count = socketsOf(item);
    if (!Number.isInteger(socket) || socket < 0 || socket >= count)
        return fail('no_socket');
    const before = Array.from({ length: count }, (_, i) => copy.runes?.[i] ?? null);
    const ref = before[socket];
    if (!isBlasphemyRef(ref))
        return fail('no_rune');
    const out = await items.updateOne({ guildId, userId, _id: copyId, runes: copy.runes }, { $set: { runes: before.map((one, i) => (i === socket ? null : one)) } });
    if (out.modifiedCount === 0)
        return fail('busy');
    await members.updateOne({ guildId, userId }, { $pull: { blasphemy: { id: blasphemyIdOf(ref) } }, $inc: { runeFragments: BLASPHEMY_BREAK_FRAGMENTS } });
    gearChanged(guildId, userId);
    return { ok: true, value: BLASPHEMY_BREAK_FRAGMENTS };
}
/** The next storage extension (null: at BLASPHEMY_STORAGE.most): `extendSlots` more for the config's divine.blasphemyExtendPrice zeiucoins (KR's +4 for 1,000 Gems). */
export const nextExtension = (slots) => (slots + BLASPHEMY_STORAGE.extendSlots <= BLASPHEMY_STORAGE.most ? { slots: BLASPHEMY_STORAGE.extendSlots, price: divinePrice('blasphemyExtendPrice') } : null);
/** Extends a member's Rune of Blasphemy storage once (nextExtension), paid at once with it. */
export async function extendBlasphemyStorage(guildId, userId) {
    const { members } = collections();
    await ensureMember(guildId, userId);
    const member = await members.findOne({ guildId, userId }, { projection: { blasphemySlots: 1 } });
    const slots = storageOf(member);
    const next = nextExtension(slots);
    if (!next)
        return fail('storage_maxed');
    const done = await members.updateOne({ guildId, userId, blasphemySlots: member?.blasphemySlots ?? null, points: { $gte: next.price } }, { $set: { blasphemySlots: slots + next.slots }, $inc: { points: -next.price } });
    if (done.modifiedCount === 0) {
        const after = await members.findOne({ guildId, userId }, { projection: { points: 1 } });
        return fail((after?.points ?? 0) < next.price ? 'too_poor' : 'busy');
    }
    await recordLedger([{ guildId, userId, delta: -next.price, reason: 'blasphemy_storage' }]);
    return { ok: true, value: true };
}
/** Takes `cost` zeiucoins (false: too few). */
async function payPoints(guildId, userId, cost) {
    if (cost <= 0)
        return true;
    const paid = await collections().members.updateOne({ guildId, userId, points: { $gte: cost } }, { $inc: { points: -cost } });
    return paid.modifiedCount > 0;
}
const refundPoints = async (guildId, userId, cost) => {
    if (cost > 0)
        await collections().members.updateOne({ guildId, userId }, { $inc: { points: cost } });
};
/**
 * Puts one of the member's Runes of Blasphemy (`id`, in storage) in a copy's `socket`th socket: one of its kind's (lib/game/divine.ts
 * blasphemySocketOf: a unique weapon's Doh/Laz/Geb, an armor's Oth, a secondary's Ans; else 'wrong_part'), never two sockets at once
 * (King's Raid's AlreadyEquippedRune: 'socketed'). What was in the socket is kept: a rune back to their runes for the config's hero.runeKeepPrice, a Rune
 * of Blasphemy back to storage for the config's divine.blasphemyKeepPrice.
 */
export async function socketBlasphemy(guildId, userId, copyId, socket, id, data = KR_BLASPHEMY) {
    const { items, members } = collections();
    const [copy, member, socketed] = await Promise.all([items.findOne({ guildId, userId, _id: copyId }), members.findOne({ guildId, userId }, { projection: { blasphemy: 1 } }), socketedBlasphemy(guildId, userId)]);
    const item = copy ? ITEMS_BY_ID.get(copy.itemId) : undefined;
    const rune = member?.blasphemy?.find((one) => one.id === id);
    const recipe = rune && data.find((one) => one.id === rune.rune);
    if (!copy || !item || !rune || !recipe)
        return fail('not_found');
    const count = socketsOf(item);
    if (!Number.isInteger(socket) || socket < 0 || socket >= count)
        return fail('no_socket');
    if (blasphemySocketOf(item, socket) !== recipe.socket)
        return fail('wrong_part');
    if (socketed.has(id))
        return fail('socketed');
    const ref = blasphemyRef(id);
    const before = Array.from({ length: count }, (_, i) => copy.runes?.[i] ?? null);
    const old = before[socket] ?? null;
    const fee = old === null ? 0 : isBlasphemyRef(old) ? divinePrice('blasphemyKeepPrice') : runeKeepPrice();
    if (!(await payPoints(guildId, userId, fee)))
        return fail('too_poor');
    const put = await items.updateOne({ guildId, userId, _id: copyId, ...(copy.runes ? { runes: copy.runes } : { runes: { $exists: false } }) }, { $set: { runes: before.map((one, i) => (i === socket ? ref : one)) } });
    if (put.modifiedCount === 0) {
        await refundPoints(guildId, userId, fee);
        return fail('busy');
    }
    // (Never in two sockets: one put in elsewhere meanwhile, this one taken back out.)
    if ((await items.countDocuments({ guildId, userId, runes: ref })) > 1) {
        await items.updateOne({ guildId, userId, _id: copyId }, { $set: { [`runes.${socket}`]: old } });
        await refundPoints(guildId, userId, fee);
        return fail('socketed');
    }
    if (old !== null && !isBlasphemyRef(old))
        await members.updateOne({ guildId, userId }, { $inc: { [`runes.${old}`]: 1 } });
    if (fee > 0)
        await recordLedger([{ guildId, userId, delta: -fee, reason: isBlasphemyRef(old) ? 'blasphemy_keep' : 'rune_keep', itemId: item.id }]);
    gearChanged(guildId, userId);
    return { ok: true, value: true };
}
/** Takes the Rune of Blasphemy out of a copy's `socket`th socket into storage, for the config's divine.blasphemyKeepPrice (KR's PunishmentRunePreservePrice); storage full: 'storage_full'. */
export async function unsocketBlasphemy(guildId, userId, copyId, socket) {
    const { items, members } = collections();
    const [copy, member, socketed] = await Promise.all([items.findOne({ guildId, userId, _id: copyId }), members.findOne({ guildId, userId }, { projection: { blasphemy: 1, blasphemySlots: 1 } }), socketedBlasphemy(guildId, userId)]);
    const item = copy ? ITEMS_BY_ID.get(copy.itemId) : undefined;
    if (!copy || !item)
        return fail('not_found');
    const count = socketsOf(item);
    if (!Number.isInteger(socket) || socket < 0 || socket >= count)
        return fail('no_socket');
    const before = Array.from({ length: count }, (_, i) => copy.runes?.[i] ?? null);
    const ref = before[socket];
    if (!isBlasphemyRef(ref))
        return fail('no_rune');
    const stored = (member?.blasphemy ?? []).filter((one) => !socketed.has(one.id)).length;
    if (stored >= storageOf(member))
        return fail('storage_full');
    const fee = divinePrice('blasphemyKeepPrice');
    if (!(await payPoints(guildId, userId, fee)))
        return fail('too_poor');
    const out = await items.updateOne({ guildId, userId, _id: copyId, runes: copy.runes }, { $set: { runes: before.map((one, i) => (i === socket ? null : one)) } });
    if (out.modifiedCount === 0) {
        await refundPoints(guildId, userId, fee);
        return fail('busy');
    }
    await recordLedger([{ guildId, userId, delta: -fee, reason: 'blasphemy_keep', itemId: item.id }]);
    gearChanged(guildId, userId);
    return { ok: true, value: true };
}
//# sourceMappingURL=divine.js.map