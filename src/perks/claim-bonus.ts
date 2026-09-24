import { CURRENCY_EMOJI } from '../constants/index.js';
import { definePerk } from './define.js';

/** Economy: more points from the hourly claim. */
export const claimBonus = definePerk({
  description: `Extra ${CURRENCY_EMOJI} on the wearer's hourly claim, as a percent.`,
  defaults: { 1: 0.05, 2: 0.1, 3: 0.2, 4: 0.3 },
  min: 0,
  max: 10,
  text: (value) => `+${value} ${CURRENCY_EMOJI} from hourly claims`,
  modifies: { claimAmount: { factor: (s) => 1 + s } },
});
