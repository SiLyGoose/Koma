import { CURRENCY_EMOJI } from '../constants/index.js';
import { definePerk } from './define.js';

/** Offense: the wearer steals more. */
export const robAmount = definePerk({
  description: `Extra ${CURRENCY_EMOJI} the wearer steals on a successful rob, as a percent of the amount rolled.`,
  defaults: { 1: 0.1, 2: 0.2, 3: 0.3, 4: 0.4 },
  min: 0,
  max: 5,
  text: (value) => `+${value} ${CURRENCY_EMOJI} stolen`,
  modifies: { robStolen: { factor: (s) => 1 + s } },
});
