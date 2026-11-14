import { boldMoney } from '../currency.js';
/** Shared by every game that takes a bet (blackjack, plinko). */
export const betText = {
    tooSmall: (min) => `The smallest bet is ${boldMoney(min)}`,
    tooBig: (max) => `The biggest bet is ${boldMoney(max)}`,
    cantAfford: (p, bet, balance) => `That bet is ${boldMoney(bet)} and you have ${boldMoney(balance)} Use \`${p}claim\` to earn more.`,
    againButton: (bet) => `Again (${bet})`,
    doubleButton: (bet) => `Double (${bet})`,
    halfButton: (bet) => `Half (${bet})`,
};
//# sourceMappingURL=bet.js.map