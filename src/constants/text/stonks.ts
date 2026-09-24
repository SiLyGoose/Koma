import { CURRENCY_EMOJI } from '../core.js';

export const stonksText = {
  /** Added under a claim STONKS! multiplied. `multiplier` is like "6.3x". `change` is signed, like "+230"; left out at 1x. */
  landed: (multiplier: string, change = '') => `STONKS! multiplied it **${multiplier}**${change ? ` (**${change}** ${CURRENCY_EMOJI})` : ''}.`,
};
