import { clamp, definePerk } from '../define.js';
import type { EffectTotals } from '../index.js';

/*
 * The D20's perk: when the wearer claims, the die may roll and change the claim. The die itself is
 * in roll.ts, its numbers (sides, divisor, crit multiplier) are D20 in constants/d20.ts, and the
 * picture is in animations/.
 */

export * from './roll.js';

export const d20 = definePerk({
  description:
    "Chance that the wearer's hourly claim rolls the D20: a 1 pays nothing, 2 to 19 multiplies the claim by the roll divided by 10, and a 20 pays double and allows one more claim that hour.",
  defaults: { 1: 0.25, 2: 0.5, 3: 0.75, 4: 1 },
  min: 0,
  max: 1,
  text: (value) =>
    `High Roller: ${value} of your claims roll a D20. A 1 pays nothing, 2 to 19 pays the roll divided by 10 (a 7 is 0.7x), and a 20 pays double and lets you claim again this hour`,
});

/** The chance (0 to 1) that a claim by this gear rolls the D20. */
export function d20Chance(gear: EffectTotals): number {
  return clamp(gear.d20, 0, 1);
}
