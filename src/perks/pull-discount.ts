import { MAX_REDUCTION } from '../constants/index.js';
import { definePerk } from './define.js';

/** Economy: gacha pulls cost less. */
export const pullDiscount = definePerk({
  description: 'Percent taken off the cost of a gacha pull.',
  defaults: { 1: 0.05, 2: 0.1, 3: 0.15, 4: 0.2 },
  min: 0,
  max: MAX_REDUCTION,
  text: (value) => `-${value} gacha pull cost`,
  modifies: { pullCost: { factor: (s) => 1 - Math.min(s, MAX_REDUCTION) } },
});
