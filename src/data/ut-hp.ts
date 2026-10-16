/*
 * A unique treasure's HP in the TechnoMagic Raid: King's Raid's own (the King's Raid Index, kingsraid.netlify.app, its
 * uniqueItemStat.treasureHp), the same for every hero, by its stars, which here are how far the copy is refined (R1 to R5:
 * 1 to 5 stars; its 0★ is left out, as a unique weapon's is). Only a hero's main treasure gives it (King's Raid's: a sub
 * treasure gives only its options), added to its HP as it is, before any share more of it.
 */
export const UT_HP: readonly [number, number, number, number, number] = [997_027, 1_178_313, 1_450_230, 1_812_791, 2_265_983];

/** The HP a unique treasure gives its hero as its main treasure, refined to `level` (1 to 5; outside that, the nearest). */
export const utHp = (level: number): number => UT_HP[Math.min(UT_HP.length, Math.max(1, Math.round(level))) - 1] as number;
