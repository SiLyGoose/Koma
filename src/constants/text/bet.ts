import { boldMoney } from './currency.js';

/** Shared by every game that takes a bet (blackjack, plinko). */
export const betText = {
  tooSmall: (min: string) => `The smallest bet is ${boldMoney(min)}`,
  tooBig: (max: string) => `The biggest bet is ${boldMoney(max)}`,
  cantAfford: (p: string, bet: string, balance: string) =>
    `That bet is ${boldMoney(bet)} and you have ${boldMoney(balance)} Use \`${p}claim\` to earn more.`,
  againButton: (bet: string) => `Again (${bet})`,
  doubleButton: (bet: string) => `Double (${bet})`,
  halfButton: (bet: string) => `Half (${bet})`,
};
