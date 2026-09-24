import { CURRENCY_EMOJI } from '../constants/index.js';
import { definePerk } from './define.js';

/**
 * Glass cannon, reward half: the wearer steals much more, but pays much more when caught
 * (glass-cannon-penalty.ts). An item that should be a glass cannon lists both perks. Stacks with
 * robAmount; used in rob-formulas.ts robStolenAmount.
 */
export const glassCannon = definePerk({
  description: `Glass cannon, reward: extra ${CURRENCY_EMOJI} the wearer steals on a successful rob, as a percent of the amount rolled (100% is 2x). Stacks with robAmount.`,
  defaults: { 1: 0.5, 2: 1, 3: 1.5, 4: 2 },
  min: 0,
  max: 5,
  text: (value) => `Glass cannon: +${value} ${CURRENCY_EMOJI} stolen`,
});
