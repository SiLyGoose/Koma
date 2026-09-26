import { WHEEL_MIN_CHANCE } from '../../constants/index.js';
import { randomUnit } from '../../lib/random.js';
import { refineShare } from '../../lib/game/refine-share.js';
import { clamp } from '../define.js';
import { WHEEL_SLICES } from './slices.js';

/**
 * The chance (0 to 1) that the wheel spins, from the wheelSpin strength the wearer's gear adds up
 * to (the setting, times the worn copy's refine share, times how much of it they get). The lowest
 * refine level spins WHEEL_MIN_CHANCE of the time and full strength always does; the levels in
 * between climb with the refine share. Weaker than R1 (a borrowed one) falls below the minimum.
 */
export function wheelSpinChance(strength: number): number {
  if (!(strength > 0)) return 0;
  const lowest = refineShare(1);
  if (lowest >= 1) return clamp(strength, 0, 1);
  return clamp(WHEEL_MIN_CHANCE + ((1 - WHEEL_MIN_CHANCE) * (strength - lowest)) / (1 - lowest), 0, 1);
}

/** The result of one spin of the wheel. */
export interface WheelSpin {
  /** Which slice it landed on (a position in WHEEL_SLICES). */
  index: number;
  /** What the points are multiplied by. */
  multiplier: number;
  /** How far into the slice the pointer stopped (0 to 1), only for the picture. */
  offset: number;
  /** The wheel it was spun on (see wheelSlices), so the picture shows the same slices. */
  slices: readonly number[];
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
  return { index, multiplier: slices[index] as number, offset: 0.1 + 0.8 * dice.offset, slices };
}

/** Points after the wheel's multiplier, rounded, and at least 1. */
export function applyWheel(amount: number, multiplier: number): number {
  return Math.max(1, Math.round(amount * multiplier));
}
