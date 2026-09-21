import { randomInt } from 'node:crypto';
import { CHANCE_STEPS } from '../constants.js';

/** Uniform random integer between min and max, both inclusive. */
export function randInt(min: number, max: number): number {
  return randomInt(min, max + 1);
}

/** A random number from 0 up to, but not including, 1. */
export function randomUnit(): number {
  return randomInt(0, CHANCE_STEPS) / CHANCE_STEPS;
}

/** True with the given probability (0 to 1). */
export function chance(probability: number): boolean {
  return randomInt(0, CHANCE_STEPS) < Math.round(probability * CHANCE_STEPS);
}

/** A random item from a non-empty list. */
export function pickRandom<T>(items: readonly T[]): T {
  return items[randomInt(0, items.length)] as T;
}
