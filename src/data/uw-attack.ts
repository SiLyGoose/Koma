import type { RaidClassId } from '../constants/raid.js';

/*
 * A unique weapon's ATK in the TechnoMagic Raid: King's Raid's own, by its hero's class and its copy's stars (0★ to 5★,
 * the index; its 0★ is the King's Raid Index's 0★ times the table's own scale for that class, the same at every star). It is added to its hero's ATK as it is (the
 * raid's ATK is King's Raid's size: Koma-UI's src/technomagic/combat/damage.ts), before any share more of it.
 */
export const UW_ATTACK: Readonly<Record<RaidClassId, readonly [number, number, number, number, number, number]>> = {
  knight: [38_483, 42_332, 50_029, 61_574, 76_968, 96_209],
  warrior: [43_615, 47_976, 56_699, 69_784, 87_230, 109_037],
  assassin: [47_957, 52_752, 62_344, 76_731, 95_914, 119_892],
  archer: [53_976, 59_373, 70_169, 86_362, 107_952, 134_940],
  mechanic: [49_239, 54_163, 64_011, 78_783, 98_479, 123_099],
  wizard: [50_325, 55_357, 65_422, 80_520, 100_650, 125_812],
  priest: [40_196, 44_215, 52_255, 64_314, 80_393, 100_491],
};

/** The ATK a unique weapon gives its hero of `heroClass`, at `level` stars (0 to 5; outside that, the nearest). */
export const uwAttack = (heroClass: RaidClassId, level: number): number => {
  const row = UW_ATTACK[heroClass];
  return row[Math.min(row.length - 1, Math.max(0, Math.round(level)))] as number;
};
