import { CONFIG } from '../config.js';
import { HEROES_BY_ID } from '../data/heroes.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { collections } from '../db.js';
import { checkHeroLoadoutName, heroLoadoutCount, heroLoadoutMoves, heroLoadoutPieces } from '../lib/game/hero-loadouts.js';
import { fitsSlot, heroWearable, wieldedBy, worksOn } from '../lib/game/heroes.js';
import { HERO_LOADOUT_SLOTS, HERO_LOADOUTS } from '../protocol/heroes.js';
import { ensureMember, recordLedger } from './economy/shared.js';
/** Saves what the member's hero `heroId` wears in HERO_LOADOUT_SLOTS into their loadout `number` (in place of what it kept; its name stays). */
export async function saveHeroLoadout(guildId, userId, heroId, number) {
    if (!HEROES_BY_ID.has(heroId))
        return { ok: false, reason: 'not_found' };
    const { items, members } = collections();
    const member = await members.findOne({ guildId, userId });
    const hero = member?.heroes?.[heroId];
    if (!hero)
        return { ok: false, reason: 'not_found' };
    if (number < 1 || number > heroLoadoutCount(member))
        return { ok: false, reason: 'locked' };
    const worn = HERO_LOADOUT_SLOTS.map((slot) => [slot, hero.equipment?.[slot]]).filter((entry) => typeof entry[1] === 'string' && entry[1] !== '');
    // (Only copies of theirs that go in that slot: one sold, or of a slot it doesn't fit, isn't kept.)
    const copies = await items.find({ guildId, userId, _id: { $in: worn.map(([, id]) => id) } }).toArray();
    const fits = new Set(copies.filter((copy) => worn.some(([slot, id]) => id === copy._id && fitsInto(copy.itemId, slot))).map((copy) => copy._id));
    const pieces = Object.fromEntries(HERO_LOADOUT_SLOTS.map((slot) => [slot, worn.find(([one, id]) => one === slot && fits.has(id))?.[1] ?? null]));
    if (Object.values(pieces).every((id) => id === null))
        return { ok: false, reason: 'nothing_worn' };
    const saved = await members.updateOne({ guildId, userId, ...Object.fromEntries(HERO_LOADOUT_SLOTS.map((slot) => [`heroes.${heroId}.equipment.${slot}`, hero.equipment?.[slot] ?? null])) }, { $set: { [`heroLoadouts.${number}.pieces`]: pieces } });
    return saved.matchedCount > 0 ? { ok: true } : { ok: false, reason: 'busy' };
}
/** Whether an item goes in a hero's `slot` at all (hero gear, of that slot's part). */
function fitsInto(itemId, slot) {
    const item = ITEMS_BY_ID.get(itemId);
    return !!item && heroWearable(item) && fitsSlot(item, slot);
}
/**
 * Puts the member's loadout `number` on their hero `heroId`: each piece it keeps that the hero can wear (of its classes) goes in its
 * slot, off any other hero wearing it; a slot it keeps nothing in (or a copy no longer theirs) is emptied; a slot whose piece the
 * hero can't wear is left as it is. 'empty' for a loadout with nothing in it, 'wrong_class' for one with nothing the hero can wear.
 */
export async function equipHeroLoadout(guildId, userId, heroId, number) {
    const heroClass = HEROES_BY_ID.get(heroId)?.class;
    if (!heroClass)
        return { ok: false, reason: 'not_found' };
    const { items, members } = collections();
    for (let attempt = 0; attempt < 3; attempt++) {
        const member = await members.findOne({ guildId, userId });
        if (!member?.heroes?.[heroId])
            return { ok: false, reason: 'not_found' };
        if (number < 1 || number > heroLoadoutCount(member))
            return { ok: false, reason: 'locked' };
        const kept = heroLoadoutPieces(member, number);
        const ids = Object.values(kept).filter((id) => id !== null);
        if (ids.length === 0)
            return { ok: false, reason: 'empty' };
        const copies = new Map((await items.find({ guildId, userId, _id: { $in: ids } }).toArray()).map((copy) => [copy._id, copy]));
        const puts = [];
        const clears = [];
        for (const slot of HERO_LOADOUT_SLOTS) {
            const id = kept[slot];
            const item = id ? ITEMS_BY_ID.get(copies.get(id)?.itemId ?? '') : undefined;
            if (!id || !item)
                clears.push(slot);
            else if (heroWearable(item) && fitsSlot(item, slot) && wieldedBy(item, heroId) && worksOn(item, heroClass))
                puts.push({ slot, copy: id });
        }
        if (puts.length === 0)
            return { ok: false, reason: copies.size === 0 ? 'empty' : 'wrong_class' };
        const { match, set } = heroLoadoutMoves(member.heroes, heroId, puts, clears);
        const moved = await members.updateOne({
            guildId,
            userId,
            [`heroes.${heroId}`]: { $exists: true },
            // (The loadout still keeps what was read.)
            ...Object.fromEntries(HERO_LOADOUT_SLOTS.map((slot) => [`heroLoadouts.${number}.pieces.${slot}`, kept[slot]])),
            ...match,
        }, { $set: set });
        if (moved.matchedCount > 0)
            return { ok: true };
    }
    return { ok: false, reason: 'busy' };
}
/** Empties the member's loadout `number` (its name stays). */
export async function resetHeroLoadout(guildId, userId, number) {
    const { members } = collections();
    const member = await members.findOne({ guildId, userId });
    if (!member || number < 1 || number > heroLoadoutCount(member))
        return { ok: false, reason: 'locked' };
    await members.updateOne({ guildId, userId }, { $set: { [`heroLoadouts.${number}.pieces`]: null } });
    return { ok: true };
}
/** Names the member's loadout `number` (an empty name: none again). */
export async function nameHeroLoadout(guildId, userId, number, raw) {
    const checked = checkHeroLoadoutName(raw);
    if (!checked.ok)
        return checked;
    const { members } = collections();
    const member = await members.findOne({ guildId, userId });
    if (!member || number < 1 || number > heroLoadoutCount(member))
        return { ok: false, reason: 'locked' };
    await members.updateOne({ guildId, userId }, { $set: { [`heroLoadouts.${number}.name`]: checked.name } });
    return { ok: true };
}
/** Buys the member their next hero gear loadout, for the config's hero.loadoutPrice points (burned), empty. */
export async function buyHeroLoadout(guildId, userId) {
    const { members } = collections();
    await ensureMember(guildId, userId);
    const member = await members.findOne({ guildId, userId });
    if (!member)
        return { ok: false, reason: 'busy' };
    const owned = heroLoadoutCount(member);
    if (owned >= HERO_LOADOUTS.most)
        return { ok: false, reason: 'maxed' };
    const price = Math.max(0, Math.floor(CONFIG.hero.loadoutPrice));
    const bought = await members.findOneAndUpdate(
    // (Missing is HERO_LOADOUTS.free: as many as were read.)
    { guildId, userId, heroLoadoutSlots: member.heroLoadoutSlots ?? null, points: { $gte: price } }, { $inc: { points: -price }, $set: { heroLoadoutSlots: owned + 1 } }, { returnDocument: 'after' });
    if (!bought) {
        const now = await members.findOne({ guildId, userId });
        return { ok: false, reason: (now?.heroLoadoutSlots ?? null) !== (member.heroLoadoutSlots ?? null) ? 'busy' : 'too_poor' };
    }
    if (price > 0)
        await recordLedger([{ guildId, userId, delta: -price, reason: 'hero_loadout', itemId: String(owned + 1) }]);
    return { ok: true, paid: price, balance: bought.points };
}
//# sourceMappingURL=hero-loadouts.js.map