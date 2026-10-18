/*
 * A unique treasure's HP in the TechnoMagic Raid: King's Raid's own (the King's Raid Index, kingsraid.netlify.app, its
 * uniqueItemStat.treasureHp), the same for every hero, by its copy's stars (0★ to 5★: the index). Only a hero's main treasure gives it (King's Raid's: a sub
 * treasure gives only its options), added to its HP as it is, before any share more of it.
 */
export const UT_HP: readonly [number, number, number, number, number, number] = [906_395, 997_027, 1_178_313, 1_450_230, 1_812_791, 2_265_983];

/** The HP a unique treasure gives its hero as its main treasure, at `level` stars (0 to 5; outside that, the nearest). */
export const utHp = (level: number): number => UT_HP[Math.min(UT_HP.length - 1, Math.max(0, Math.round(level)))] as number;
