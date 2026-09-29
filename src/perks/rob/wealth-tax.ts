import { CURRENCY_EMOJI } from '../../constants/index.js';
import { definePerk } from '../define.js';

/**
 * Wealth tax: a successful rob of a member holding more than rob.wealthTaxThreshold also takes a share
 * (rob.wealthTaxRate) of what they hold over it. This perk raises the robber's share. Taken in
 * services/economy/rob.ts.
 */
export const wealthTax = definePerk({
  description: `Added to the share of a rich victim's ${CURRENCY_EMOJI} over the wealth tax line (rob.wealthTaxThreshold) that a successful rob by the wearer also takes.`,
  defaults: { 1: 0.0075, 2: 0.015, 3: 0.0225, 4: 0.03 },
  min: 0,
  max: 1,
  text: (value) => `+${value} wealth tax on rich victims`,
  modifies: { wealthTaxRate: { add: (s) => s } },
});

/** Points a wealth tax of `rate` takes from a victim holding `balance`: that share of what they hold over `threshold`, rounded down. */
export function wealthTaxAmount(balance: number, threshold: number, rate: number): number {
  if (balance <= threshold || rate <= 0) return 0;
  return Math.floor((balance - threshold) * rate);
}
