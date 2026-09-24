import { CURRENCY_EMOJI, MAX_REDUCTION } from '../constants.js';
import { definePerk } from './define.js';

/**
 * Coughing Baby and Frog: a weaker rob, paired with a tax on something the victim does next
 * (claim-tax.ts for the baby, rob-tax.ts for the frog). Used in rob-formulas.ts robStolenAmount.
 */
export const robAmountCut = definePerk({
  description: `Percent cut from the ${CURRENCY_EMOJI} the wearer steals on a successful rob (25% means 75% of the amount).`,
  defaults: { 1: 0.0625, 2: 0.125, 3: 0.1875, 4: 0.25 },
  min: 0,
  max: MAX_REDUCTION,
  text: (value) => `-${value} ${CURRENCY_EMOJI} stolen`,
});
