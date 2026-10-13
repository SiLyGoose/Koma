import { CURRENCY_EMOJI } from '../../constants/index.js';
import { definePerk } from '../define.js';

/** Economy: more points from jobs. Jobs pay through jobEarnings (stats.ts), so they pick it up from there. */
export const jobPay = definePerk({
  description: `Extra ${CURRENCY_EMOJI} from the wearer's jobs, as a percent.`,
  defaults: { 1: 0.05, 2: 0.1, 3: 0.2, 4: 0.5 },
  min: 0,
  max: 10,
  text: (value) => `+${value} ${CURRENCY_EMOJI} from jobs`,
  modifies: { jobPay: { factor: (s) => 1 + s } },
});
