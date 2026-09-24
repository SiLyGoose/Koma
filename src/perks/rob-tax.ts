import { CURRENCY_EMOJI } from '../constants/index.js';
import { claimTaxAmount } from './claim-tax.js';
import { definePerk } from './define.js';

/** Yowch, My Coins! (Frog): after a successful rob, the victim's next successful rob is taxed and paid to the wearer. */
export const robTax = definePerk({
  description: `Percent of the ${CURRENCY_EMOJI} the victim steals on their next successful rob that are taken and paid to the wearer, after the wearer robs them successfully.`,
  defaults: { 1: 0.0625, 2: 0.125, 3: 0.1875, 4: 0.25 },
  min: 0,
  max: 1,
  text: (value) => `Yowch, My Coins! You get ${value} of the next rob by members you rob`,
  modifies: { robTaxRate: { add: (s) => s } },
});

/** Points taken from a rob that stole `amount` by a tax of `rate`. Never more than the rob. */
export function robTaxAmount(amount: number, rate: number): number {
  return claimTaxAmount(amount, rate);
}
