import { CURRENCY_EMOJI, WHEEL_MIN_CHANCE } from '../../constants/index.js';
import { formatPercent } from '../../lib/format.js';
import { definePerk } from '../define.js';
import { WHEEL_SLICES, wheelSlices } from './slices.js';
import { wheelSpinChance } from './spin.js';

/*
 * The Wheelchair's perk: when the wearer claims or robs successfully, the wheel may spin and
 * multiply the points. How often it spins climbs with refinement, from WHEEL_MIN_CHANCE at R1 to
 * every time at R5 (see wheelSpinChance). The wheel's slices are in slices.ts, the spin itself in
 * spin.ts, and the picture in animations/.
 */

export * from './slices.js';
export * from './spin.js';

const wheelText = (chance: string, slices: readonly number[] = WHEEL_SLICES): string =>
  `Wheel of Fortune: ${chance} of your claims and successful robs spin the wheel, multiplying what you get by ${Math.min(...slices)}x to ${Math.max(...slices)}x`;

export const wheelSpin = definePerk({
  description: `How strong the wheel is (perks/wheel-spin/slices.ts), which multiplies the ${CURRENCY_EMOJI} of the wearer's hourly claim or successful rob. At full strength (100%, fully refined) every one spins; at R1 ${formatPercent(WHEEL_MIN_CHANCE)} do (WHEEL_MIN_CHANCE)`,
  defaults: { 1: 0.25, 2: 0.5, 3: 0.75, 4: 1 },
  min: 0,
  max: 1,
  text: (value) => wheelText(value),
  // The gear card shows the spin chance, not the raw strength (see wheelSpinChance).
  line: (strength, settings) => wheelText(formatPercent(wheelSpinChance(strength)), wheelSlices(settings.wheel.maxMultiplier)),
  modifies: { wheelChance: { add: (s) => wheelSpinChance(s) } },
});
