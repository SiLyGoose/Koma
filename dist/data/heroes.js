import { RAID_CLASS_IDS } from '../constants/raid.js';
import { TM_HEROES } from '../../vendor/technomagic-sim.mjs';
const isRaidClass = (id) => RAID_CLASS_IDS.includes(id);
/** In the order the shop and the heroes page show them. */
export const HEROES = TM_HEROES.map(({ id, name, class: heroClass, deals, skins, outfits, skills }) => {
    if (!isRaidClass(heroClass))
        throw new Error(`The raid's hero ${id} is of a class the bot doesn't know (${heroClass})`);
    return { id, name, class: heroClass, deals, skins, outfits, abilities: skills };
});
export const HEROES_BY_ID = new Map(HEROES.map((hero) => [hero.id, hero]));
/** Every hero's outfits (not its own look), by name: whose it is, and its skin's index. */
export const HERO_OUTFITS = new Map(HEROES.flatMap((hero) => hero.outfits.slice(1).map((outfit, i) => [outfit, { hero: hero.id, skin: i + 1 }])));
/** Whether an outfit is one of King's Raid's Legend Costumes (its skin `<Hero>_Legend`, Koma-UI's): sold at hero.legendOutfitPrice. */
export const isLegendOutfit = (id) => /_Legend\d*$/.test(id);
/** Heroes whose Glory League costumes have all four of King's Raid's tiers: `_Glory` of Honor, 2 of Brilliant Honor, 3 of Glaring Honor, 4 of Eternal Honor. */
const FOUR_GLORY_TIERS = new Set(['Crow', 'Mirianne', 'Scarlet', 'Theo']);
/** Heroes whose `_Glory2` is of Brilliant Honor and `_Glory3` Champion <Hero> of Honor. */
const BRILLIANT_GLORY = new Set(['Jane', 'Laias']);
/**
 * A Glory League costume's tier (its skin `<Hero>_Glory<N>`, Koma-UI's, and its title there), else null: `honor` (of
 * Honor, Champion of Honor), `brilliant` (of Brilliant Honor) or `glaring` (of Glaring Honor, and Eternal Honor above it).
 * Any other hero's `_Glory2` is of Glaring Honor. Sold at hero.honorOutfitPrice, brilliantOutfitPrice or glaringOutfitPrice.
 */
export function gloryTier(id) {
    const glory = /^(.+)_Glory(\d*)$/.exec(id);
    if (!glory)
        return null;
    const [, hero, n] = glory;
    const tier = Number(n || 1);
    if (tier === 1)
        return 'honor';
    if (FOUR_GLORY_TIERS.has(hero))
        return tier === 2 ? 'brilliant' : 'glaring';
    if (BRILLIANT_GLORY.has(hero))
        return tier === 2 ? 'brilliant' : 'honor';
    return 'glaring';
}
//# sourceMappingURL=heroes.js.map