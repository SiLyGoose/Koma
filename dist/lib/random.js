import { randomInt } from 'node:crypto';
import { CHANCE_STEPS } from '../constants/index.js';
/** Uniform random integer between min and max, both inclusive. */
export function randInt(min, max) {
    return randomInt(min, max + 1);
}
/** A random number from 0 up to, but not including, 1. */
export function randomUnit() {
    return randomInt(0, CHANCE_STEPS) / CHANCE_STEPS;
}
/** True with the given probability (0 to 1). */
export function chance(probability) {
    return randomInt(0, CHANCE_STEPS) < Math.round(probability * CHANCE_STEPS);
}
/** A random item from a non-empty list. */
export function pickRandom(items) {
    return items[randomInt(0, items.length)];
}
//# sourceMappingURL=random.js.map