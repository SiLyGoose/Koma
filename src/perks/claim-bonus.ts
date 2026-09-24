import { CURRENCY_EMOJI } from '../constants/index.js';
import { definePerk } from './define.js';
import type { EffectTotals } from './index.js';

/** Economy: more points from the hourly claim. */
export const claimBonus = definePerk({
  description: `Extra ${CURRENCY_EMOJI} on the wearer's hourly claim, as a percent.`,
  defaults: { 1: 0.05, 2: 0.1, 3: 0.2, 4: 0.3 },
  min: 0,
  max: 10,
  text: (value) => `+${value} ${CURRENCY_EMOJI} from hourly claims`,
});

/** Points from an hourly claim, after the claim bonus. */
export function claimAmount(rolled: number, gear: EffectTotals): number {
  return Math.round(rolled * (1 + gear.claimBonus));
}
