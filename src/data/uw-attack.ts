import type { RaidClassId } from '../constants/raid.js';

/*
 * A unique weapon's ATK in the TechnoMagic Raid: King's Raid's own, by its hero's class and its stars, which
 * here are how far the copy is refined (R1 to R5: 1 to 5 stars). It is added to its hero's ATK as it is (the
 * raid's ATK is King's Raid's size: Koma-UI's src/technomagic/combat/damage.ts), before any share more of it.
 */
export const UW_ATTACK: Readonly<Record<RaidClassId, readonly [number, number, number, number, number]>> = {
  knight: [42_332, 50_029, 61_574, 76_968, 96_209],
  warrior: [47_976, 56_699, 69_784, 87_230, 109_037],
  assassin: [52_752, 62_344, 76_731, 95_914, 119_892],
  archer: [59_373, 70_169, 86_362, 107_952, 134_940],
  mechanic: [54_163, 64_011, 78_783, 98_479, 123_099],
  wizard: [55_357, 65_422, 80_520, 100_650, 125_812],
  priest: [44_215, 52_255, 64_314, 80_393, 100_491],
};

/** The ATK a unique weapon gives its hero of `heroClass`, refined to `level` (1 to 5; outside that, the nearest). */
export const uwAttack = (heroClass: RaidClassId, level: number): number => {
  const row = UW_ATTACK[heroClass];
  return row[Math.min(row.length, Math.max(1, Math.round(level))) - 1] as number;
};
