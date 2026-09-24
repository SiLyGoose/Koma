import { D20 } from '../../constants.js';
import { randomUnit } from '../../lib/random.js';

/*
 * The D20 item's die, as pure functions. The roll decides everything (see D20 in constants.ts):
 * 1 is a critical fail, the top number a critical success, and anything between multiplies the claim.
 */

export type D20Kind = 'fail' | 'normal' | 'success';

/** The result of one roll of the die. */
export interface D20Roll {
  /** The number rolled, 1 to D20.sides. */
  roll: number;
  kind: D20Kind;
  /** What the claim is multiplied by: 0 for a fail, D20.critMultiplier for a success, roll / D20.divisor otherwise. */
  multiplier: number;
}

/** The two random numbers (each 0 up to but not including 1) a roll needs. */
export interface D20Dice {
  /** Decides whether the die rolls at all. */
  trigger: number;
  /** Decides the number rolled. */
  face: number;
}

export function rollD20Dice(): D20Dice {
  return { trigger: randomUnit(), face: randomUnit() };
}

export function d20Kind(roll: number): D20Kind {
  if (roll <= 1) return 'fail';
  if (roll >= D20.sides) return 'success';
  return 'normal';
}

export function d20Multiplier(roll: number): number {
  const kind = d20Kind(roll);
  if (kind === 'fail') return 0;
  if (kind === 'success') return D20.critMultiplier;
  return roll / D20.divisor;
}

/**
 * Rolls the die: it rolls with probability `strength` (0 to 1) and every number is equally likely.
 * Returns null when it doesn't roll. Taking the dice as input keeps this exact and testable, and
 * lets a caller that has to retry keep the same roll.
 */
export function rollD20(strength: number, dice: D20Dice): D20Roll | null {
  if (!(strength > 0) || dice.trigger >= Math.min(1, strength)) return null;
  const roll = Math.min(D20.sides, 1 + Math.floor(dice.face * D20.sides));
  return { roll, kind: d20Kind(roll), multiplier: d20Multiplier(roll) };
}

/**
 * Points after the die: nothing for a critical fail, otherwise the multiplied amount, rounded, and
 * at least 1 (a low roll on a small claim never rounds down to nothing).
 */
export function applyD20(amount: number, d20: D20Roll): number {
  if (d20.kind === 'fail') return 0;
  return Math.max(1, Math.round(amount * d20.multiplier));
}
