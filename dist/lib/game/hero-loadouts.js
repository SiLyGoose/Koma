import { HERO_LOADOUT_SLOTS, HERO_LOADOUTS } from '../../protocol/heroes.js';
import { HERO_SLOTS } from '../../types.js';
/** How many hero gear loadouts a member has (MemberDoc.heroLoadoutSlots): HERO_LOADOUTS.free to HERO_LOADOUTS.most. */
export const heroLoadoutCount = (member) => Math.min(HERO_LOADOUTS.most, Math.max(HERO_LOADOUTS.free, Math.floor(member?.heroLoadoutSlots ?? HERO_LOADOUTS.free)));
/** What buying the member's next hero gear loadout costs (`price`, the config's hero.loadoutPrice); null: they have them all. */
export const nextHeroLoadoutPrice = (member, price) => (heroLoadoutCount(member) < HERO_LOADOUTS.most ? price : null);
/** The copy kept in each of a loadout's slots, as kept (null: none). */
export function heroLoadoutPieces(member, number) {
    const pieces = member?.heroLoadouts?.[String(number)]?.pieces;
    return Object.fromEntries(HERO_LOADOUT_SLOTS.map((slot) => [slot, typeof pieces?.[slot] === 'string' && pieces[slot] !== '' ? pieces[slot] : null]));
}
/** Every copy kept in any of the member's hero gear loadouts. Selling, salvaging and refining never use these up. */
export function heroLoadoutCopyIds(member) {
    const ids = new Set();
    for (let number = 1; number <= heroLoadoutCount(member); number++)
        for (const id of Object.values(heroLoadoutPieces(member, number)))
            if (id)
                ids.add(id);
    return ids;
}
/** Every hero gear loadout the member has, in order, as the heroes page shows them: only copies in `owned` (the ones they still have). */
export function heroLoadoutViews(member, owned) {
    return Array.from({ length: heroLoadoutCount(member) }, (_, i) => {
        const number = i + 1;
        const pieces = heroLoadoutPieces(member, number);
        const name = member?.heroLoadouts?.[String(number)]?.name;
        return {
            number,
            name: typeof name === 'string' && name !== '' ? name : null,
            pieces: Object.fromEntries(HERO_LOADOUT_SLOTS.map((slot) => [slot, pieces[slot] && owned.has(pieces[slot]) ? pieces[slot] : null])),
        };
    });
}
/** What a name can be made of: letters, digits, spaces and a little punctuation. */
const NAME_CHARACTERS = /^[\p{L}\p{N} '’.,:!?&()#+\-_/★]+$/u;
/** A new name for a hero gear loadout, its spaces tidied (null: none again), or why it can't be: too long, or characters a name can't have. */
export function checkHeroLoadoutName(raw) {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (name === '')
        return { ok: true, name: null };
    if (name.length > HERO_LOADOUTS.maxNameLength)
        return { ok: false, reason: 'too_long' };
    if (!NAME_CHARACTERS.test(name))
        return { ok: false, reason: 'bad_name' };
    return { ok: true, name };
}
/**
 * Putting a loadout on hero `heroId`: `puts`, each copy going into its slot; `clears`, its slots the loadout keeps nothing in
 * (emptied). Every other place among the member's heroes one of those copies is now, where it comes off (a copy is on one hero,
 * in one slot), as the update's `set`; and `match`, what the member document must still have for the update to be made: each of
 * those places still holding that copy, and no other place holding any of them.
 */
export function heroLoadoutMoves(heroes, heroId, puts, clears) {
    const ours = new Set(puts.map((put) => put.copy));
    const targets = new Set(puts.map((put) => `heroes.${heroId}.equipment.${put.slot}`));
    const match = {};
    const set = {};
    for (const [id, hero] of Object.entries(heroes ?? {})) {
        for (const slot of HERO_SLOTS) {
            const path = `heroes.${id}.equipment.${slot}`;
            if (targets.has(path))
                continue;
            const now = hero?.equipment?.[slot];
            if (typeof now === 'string' && ours.has(now)) {
                match[path] = now;
                set[path] = null;
            }
            else if (ours.size > 0)
                match[path] = { $nin: [...ours] };
        }
    }
    for (const slot of clears)
        set[`heroes.${heroId}.equipment.${slot}`] = null;
    for (const put of puts)
        set[`heroes.${heroId}.equipment.${put.slot}`] = put.copy;
    return { match, set };
}
//# sourceMappingURL=hero-loadouts.js.map