import { CURRENCY_EMOJI } from '../core.js';
import { boldMoney } from './currency.js';

export const plinkoText = {
  usage: (p: string) => `Use \`${p}plinko <bet>\` to drop a ball, like \`${p}plinko 100\`, or \`${p}plinko all\`.`,
  badBet: (p: string) => `The bet has to be a whole number of ${CURRENCY_EMOJI}, like \`${p}plinko 100\`, or \`all\`.`,
  dropTitle: 'Plinko',
  dropping: (user: string, bet: string) => `${user} drops a ball for ${boldMoney(bet)}`,
  /** `multiplier` is like "3x". */
  resultTitle: (multiplier: string) => `Plinko: ${multiplier}`,
  landed: (user: string, bet: string, multiplier: string) => `${user} bet ${boldMoney(bet)} and the ball landed on **${multiplier}**.`,
  paidMore: (payout: string) => `They won ${boldMoney(payout)}`,
  paidSame: 'They got their bet back.',
  paidLess: (payout: string) => `They got ${boldMoney(payout)} back.`,
  paidNothing: 'They lost it all.',
  author: (name: string) => `${name} played plinko`,
  betField: 'Bet',
  payoutField: 'Payout',
  /** `change` is signed, like "+200" or "-50". */
  payout: (payout: string, change: string) => `${payout} ${CURRENCY_EMOJI} (${change} ${CURRENCY_EMOJI})`,
  balanceField: 'Balance',
  /** `percent` is like "98%": what the board pays back on average. */
  footer: (percent: string) => `The board pays back ${percent} of a bet on average.`,
  notYours: 'This is not your game.',
};
