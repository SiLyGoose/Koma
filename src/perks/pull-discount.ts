import { MAX_REDUCTION } from '../constants.js';
import { definePerk } from './define.js';
import type { EffectTotals } from './index.js';

/** Economy: gacha pulls cost less. */
export const pullDiscount = definePerk({
  description: 'Percent taken off the cost of a gacha pull.',
  defaults: { 1: 0.05, 2: 0.1, 3: 0.15, 4: 0.2 },
  min: 0,
  max: MAX_REDUCTION,
  text: (value) => `-${value} gacha pull cost`,
});

/** Cost of a gacha pull, after the discount. Never below 1. */
export function pullCost(base: number, gear: EffectTotals): number {
  return Math.max(1, Math.round(base * (1 - Math.min(gear.pullDiscount, MAX_REDUCTION))));
}
