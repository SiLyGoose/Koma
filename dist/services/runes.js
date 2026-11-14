import { CONFIG } from '../config.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { KR_RUNES_BY_ID, rollRuneOfGrade } from '../data/kr-gear.js';
import { collections } from '../db.js';
import { socketsOf } from '../lib/game/heroes.js';
import { RUNE_BOXES, RUNE_FRAGMENTS, RUNE_SELL_POINTS } from '../protocol/runes.js';
import { recordLedger } from './economy/shared.js';
import { isBlasphemyRef } from '../lib/game/divine.js';
import { breakSocketedBlasphemy } from './divine.js';
/**
 * Sells (or, `disassemble`, breaks into Rune Fragments) as many of each of the member's runes as `runes` says (at most as
 * many as they have; unknown ids and counts under one left out). None to sell: 'nothing_to_sell'.
 */
export async function sellRunes(guildId, userId, runes, disassemble) {
    const { members } = collections();
    const member = await members.findOne({ guildId, userId }, { projection: { runes: 1 } });
    const taken = [];
    for (const [id, asked] of Object.entries(runes)) {
        const count = Math.min(Math.floor(asked), member?.runes?.[id] ?? 0);
        if (KR_RUNES_BY_ID.has(id) && count > 0)
            taken.push([id, count]);
    }
    if (taken.length === 0)
        return { ok: false, reason: 'nothing_to_sell' };
    const sale = { runes: 0, points: 0, fragments: 0 };
    for (const [id, count] of taken) {
        const grade = KR_RUNES_BY_ID.get(id)?.grade ?? 1;
        sale.runes += count;
        if (disassemble)
            sale.fragments += count * (RUNE_FRAGMENTS[grade] ?? 0);
        else
            sale.points += count * (RUNE_SELL_POINTS[grade] ?? 0);
    }
    const done = await members.updateOne({ guildId, userId, ...Object.fromEntries(taken.map(([id, count]) => [`runes.${id}`, { $gte: count }])) }, { $inc: { ...Object.fromEntries(taken.map(([id, count]) => [`runes.${id}`, -count])), ...(disassemble ? { runeFragments: sale.fragments } : { points: sale.points }) } });
    if (done.modifiedCount === 0)
        return { ok: false, reason: 'busy' };
    if (!disassemble)
        await recordLedger([{ guildId, userId, delta: sale.points, reason: 'rune_sell' }]);
    return { ok: true, value: sale };
}
/** Crafts `count` of a Mysterious Rune (`box`) from the member's Rune Fragments: the runes they gave. Too few fragments: 'no_fragments'. */
export async function craftRunes(guildId, userId, box, count, rng) {
    const recipe = RUNE_BOXES.find((one) => one.id === box);
    if (!recipe || !Number.isInteger(count) || count < 1)
        return { ok: false, reason: 'not_found' };
    const rolled = Array.from({ length: count }, () => rollRuneOfGrade(recipe.grade, rng, box === 'ancient')).filter((id) => id !== null);
    if (rolled.length !== count)
        return { ok: false, reason: 'not_found' };
    const cost = Math.max(1, Math.floor(CONFIG.craft.runes[box])) * count;
    const inc = { runeFragments: -cost };
    for (const id of rolled)
        inc[`runes.${id}`] = (inc[`runes.${id}`] ?? 0) + 1;
    const done = await collections().members.updateOne({ guildId, userId, runeFragments: { $gte: cost } }, { $inc: inc });
    return done.modifiedCount === 0 ? { ok: false, reason: 'no_fragments' } : { ok: true, value: rolled };
}
/** Disassembles the rune in one of the member's copies' sockets (its `socket`th) where it is: the Rune Fragments it gave. */
export async function breakSocketedRune(guildId, userId, copyId, socket) {
    const { items, members } = collections();
    const copy = await items.findOne({ guildId, userId, _id: copyId });
    const item = copy ? ITEMS_BY_ID.get(copy.itemId) : undefined;
    if (!copy || !item)
        return { ok: false, reason: 'not_found' };
    const count = socketsOf(item);
    if (!Number.isInteger(socket) || socket < 0 || socket >= count)
        return { ok: false, reason: 'no_socket' };
    const before = Array.from({ length: count }, (_, i) => copy.runes?.[i] ?? null);
    const old = before[socket];
    if (!old)
        return { ok: false, reason: 'no_rune' };
    // (A Rune of Blasphemy: broken as services/divine.ts breaks one, for its own fragments.)
    if (isBlasphemyRef(old)) {
        const broken = await breakSocketedBlasphemy(guildId, userId, copyId, socket);
        return broken.ok ? { ok: true, value: broken.value } : { ok: false, reason: broken.reason === 'no_socket' || broken.reason === 'not_found' || broken.reason === 'no_rune' ? broken.reason : 'busy' };
    }
    const out = await items.updateOne({ guildId, userId, _id: copyId, runes: copy.runes }, { $set: { runes: before.map((one, i) => (i === socket ? null : one)) } });
    if (out.modifiedCount === 0)
        return { ok: false, reason: 'busy' };
    const fragments = RUNE_FRAGMENTS[KR_RUNES_BY_ID.get(old)?.grade ?? 1] ?? 0;
    await members.updateOne({ guildId, userId }, { $inc: { runeFragments: fragments } });
    return { ok: true, value: fragments };
}
//# sourceMappingURL=runes.js.map