import { CURRENCY_EMOJI } from '../../constants/index.js';
import { definePerk } from '../define.js';
import { WHEEL_SLICES } from './slices.js';

/*
 * The Wheelchair's perk: when the wearer claims or robs successfully, the wheel may spin and
 * multiply the points. The wheel's slices are in slices.ts, the spin itself in spin.ts, and the
 * picture in animations/.
 */

export * from './slices.js';
export * from './spin.js';

export const wheelSpin = definePerk({
  description: `Chance that the wearer's hourly claim or successful rob spins the wheel (perks/wheel-spin/slices.ts), which multiplies the ${CURRENCY_EMOJI}`,
  defaults: { 1: 0.25, 2: 0.5, 3: 0.75, 4: 1 },
  min: 0,
  max: 1,
  text: (value) =>
    `Wheel of Fortune: ${value} of your claims and successful robs spin the wheel, multiplying the ${CURRENCY_EMOJI} by ${Math.min(...WHEEL_SLICES)}x to ${Math.max(...WHEEL_SLICES)}x`,
  modifies: { wheelChance: { add: (s) => s } },
});
