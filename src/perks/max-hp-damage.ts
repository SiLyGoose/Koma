import { definePerk } from './define.js';

/**
 * Raid: each of the wearer's attacks deals this share of the boss's max HP on top (0.5% of a
 * 3,720 HP boss is about 19). Added after rallies and crits, so it stays that share.
 * Its own mechanic, in lib/events/raid.ts.
 */
export const maxHpDamage = definePerk({
  description: "Raid: extra damage on each of the wearer's attacks, as a share of the boss's max HP (added after rallies and crits).",
  defaults: { 1: 0.002, 2: 0.003, 3: 0.005, 4: 0.008 },
  min: 0,
  max: 0.1,
  text: (value) => `Raid: attacks also deal ${value} of the boss's max HP`,
});
