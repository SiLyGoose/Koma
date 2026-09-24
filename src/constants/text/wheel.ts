import { CURRENCY_EMOJI } from '../core.js';

export const wheelText = {
  /** Added under a claim or rob when the wheel spun. `multiplier` is like "1.5x". */
  /** `change` is what the spin did to the points with its sign, like "+50" or "-90"; left out when it changed nothing. */
  landed: (multiplier: string, change = '') => `The wheel landed on **${multiplier}**${change ? ` (**${change}** ${CURRENCY_EMOJI})` : ''}.`,
  /** Shown while the wheel is still turning. `user` is a mention. */
  spinningTitle: 'The wheel is spinning...',
  spinning: (user: string) => `${user} spins the wheel...`,
};
