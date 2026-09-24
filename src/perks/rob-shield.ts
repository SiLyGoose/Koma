import { CURRENCY_EMOJI, MAX_REDUCTION } from '../constants/index.js';
import { definePerk } from './define.js';

/** Defense: the wearer keeps part of what a successful robber takes. Used in rob-formulas.ts robStolenAmount. */
export const robShield = definePerk({
  description: 'Percent of the stolen amount the wearer keeps when they are robbed successfully.',
  defaults: { 1: 0.1, 2: 0.15, 3: 0.2, 4: 0.25 },
  min: 0,
  max: MAX_REDUCTION,
  text: (value) => `-${value} ${CURRENCY_EMOJI} lost when robbed`,
});
