import { CURRENCY_EMOJI } from '../core.js';

export const plinkoText = {
  usage: (p: string) => `Use \`${p}plinko <bet>\` to drop a ball, like \`${p}plinko 100\`, or \`${p}plinko all\`.`,
  badBet: (p: string) => `The bet has to be a whole number of ${CURRENCY_EMOJI}, like \`${p}plinko 100\`, or \`all\`.`,
  tooSmall: (min: string) => `The smallest bet is **${min}** ${CURRENCY_EMOJI}.`,
  tooBig: (max: string) => `The biggest bet is **${max}** ${CURRENCY_EMOJI}.`,
  cantAfford: (p: string, bet: string, balance: string) =>
    `That bet is **${bet}** ${CURRENCY_EMOJI} and you have **${balance}** ${CURRENCY_EMOJI}. Use \`${p}claim\` to earn more.`,
  dropTitle: 'Plinko',
  dropping: (user: string, bet: string) => `${user} drops a ball for **${bet}** ${CURRENCY_EMOJI}...`,
  /** `multiplier` is like "3x". */
  resultTitle: (multiplier: string) => `Plinko: ${multiplier}`,
  landed: (user: string, bet: string, multiplier: string) => `${user} bet **${bet}** ${CURRENCY_EMOJI} and the ball landed on **${multiplier}**.`,
  paidMore: (payout: string) => `They won **${payout}** ${CURRENCY_EMOJI}!`,
  paidSame: 'They got their bet back.',
  paidLess: (payout: string) => `They got **${payout}** ${CURRENCY_EMOJI} back.`,
  paidNothing: 'They lost it all.',
  author: (name: string) => `${name} played plinko`,
  betField: 'Bet',
  payoutField: 'Payout',
  /** `change` is signed, like "+200" or "-50". */
  payout: (payout: string, change: string) => `${payout} ${CURRENCY_EMOJI} (${change} ${CURRENCY_EMOJI})`,
  balanceField: 'Balance',
  /** `percent` is like "98%": what the board pays back on average. */
  footer: (percent: string) => `The board pays back ${percent} of a bet on average.`,
  againButton: (bet: string) => `Again (${bet})`,
  doubleButton: (bet: string) => `Double (${bet})`,
  halfButton: (bet: string) => `Half (${bet})`,
  notYours: 'This is not your game.',
};
