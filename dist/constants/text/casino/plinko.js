import { CURRENCY_EMOJI } from '../../core.js';
import { boldMoney } from '../currency.js';
export const plinkoText = {
    usage: (p) => `Use \`${p}plinko <bet>\` to drop a ball, like \`${p}plinko 100\`, or \`${p}plinko all\`.`,
    badBet: (p) => `The bet has to be a whole number of ${CURRENCY_EMOJI}, like \`${p}plinko 100\`, or \`all\`.`,
    dropTitle: 'Plinko',
    dropping: (user, bet) => `${user} drops a ball for ${boldMoney(bet)}`,
    /** `multiplier` is like "3x". */
    resultTitle: (multiplier) => `Plinko: ${multiplier}`,
    landed: (user, bet, multiplier) => `${user} bet ${boldMoney(bet)} and the ball landed on **${multiplier}**.`,
    paidMore: (payout) => `They won ${boldMoney(payout)}`,
    paidSame: 'They got their bet back.',
    paidLess: (payout) => `They got ${boldMoney(payout)} back.`,
    paidNothing: 'They lost it all.',
    author: (name) => `${name} played plinko`,
    betField: 'Bet',
    payoutField: 'Payout',
    /** `change` is signed, like "+200" or "-50". */
    payout: (payout, change) => `${payout} ${CURRENCY_EMOJI} (${change} ${CURRENCY_EMOJI})`,
    balanceField: 'Balance',
    /** `percent` is like "98%": what the board pays back on average. */
    footer: (percent) => `The board pays back ${percent} of a bet on average.`,
    notYours: 'This is not your game.',
};
//# sourceMappingURL=plinko.js.map