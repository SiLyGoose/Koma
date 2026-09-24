import { CURRENCY_EMOJI } from '../constants/index.js';
import { definePerk } from './define.js';

/**
 * Chaewon Photocard, reward half: the wearer gets more from claims and steals more on robs, but is
 * easier to rob (iconic-by-mistake.ts). Stacks with claimBonus and robAmount.
 */
export const smart = definePerk({
  description: `Smart: extra ${CURRENCY_EMOJI} on the wearer's hourly claim and on a successful rob, as a percent (75% is 1.75x). Stacks with claimBonus and robAmount.`,
  defaults: { 1: 0.25, 2: 0.4, 3: 0.6, 4: 0.75 },
  min: 0,
  max: 10,
  text: (value) => `Smart: +${value} ${CURRENCY_EMOJI} from hourly claims and robs`,
  modifies: {
    claimAmount: { factor: (s) => 1 + s },
    robStolen: { factor: (s) => 1 + s },
  },
});
