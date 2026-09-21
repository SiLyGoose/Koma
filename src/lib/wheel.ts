import { WHEEL_SLICES } from '../data/wheel.js';
import { randomUnit } from './random.js';

/** The result of one spin of the wheel. */
export interface WheelSpin {
  /** Which slice it landed on (a position in WHEEL_SLICES). */
  index: number;
  /** What the points are multiplied by. */
  multiplier: number;
  /** How far into the slice the pointer stopped (0 to 1), only for the picture. */
  offset: number;
}

/** The three random numbers (each 0 up to but not including 1) a spin needs. */
export interface WheelDice {
  /** Decides whether the wheel spins at all. */
  trigger: number;
  /** Decides which slice it lands on. */
  slice: number;
  /** Decides where in the slice the pointer stops. */
  offset: number;
}

export function rollWheelDice(): WheelDice {
  return { trigger: randomUnit(), slice: randomUnit(), offset: randomUnit() };
}

/**
 * Spins the wheel: it spins with probability `strength` (0 to 1), and every slice is equally
 * likely. Returns null when it doesn't spin. Taking the dice as input keeps this exact and
 * testable, and lets a caller that has to retry keep the same spin.
 */
export function spinWheel(strength: number, dice: WheelDice, slices: readonly number[] = WHEEL_SLICES): WheelSpin | null {
  if (!(strength > 0) || dice.trigger >= Math.min(1, strength) || slices.length === 0) return null;
  const index = Math.min(slices.length - 1, Math.floor(dice.slice * slices.length));
  // Keep the pointer off the slice edges so the picture is never ambiguous.
  return { index, multiplier: slices[index] as number, offset: 0.1 + 0.8 * dice.offset };
}

/** Points after the wheel's multiplier, rounded, and at least 1. */
export function applyWheel(amount: number, multiplier: number): number {
  return Math.max(1, Math.round(amount * multiplier));
}
