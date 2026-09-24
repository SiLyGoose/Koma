import { boldMoney } from './currency.js';

export const d20Text = {
  /** Shown while the die is still tumbling. `user` is a mention. */
  spinningTitle: 'The die is rolling...',
  spinning: (user: string) => `${user} rolls the D20...`,
  failTitle: 'Critical fail!',
  successTitle: 'Critical success!',
  /** A roll of 1: the whole claim text. */
  fail: (user: string, roll: number) =>
    `${user} rolled a **${roll}** on the D20. Critical fail! Nothing to claim, and no more claims this hour.`,
  /** Added under a claim that rolled 2 up to one below the top. `multiplier` is like "1.3x". */
  /** `change` is what the die did to the points with its sign, like "+30" or "-40"; left out when it changed nothing. */
  landed: (roll: number, multiplier: string, change = '') => `The D20 landed on **${roll}**: **${multiplier}**${change ? ` (${boldMoney(change)})` : ''}.`,
  /** Added under a claim that rolled the top number. */
  critical: (roll: number, multiplier: string, change = '') =>
    `Critical success! The D20 landed on **${roll}** and paid **${multiplier}**${change ? ` (${boldMoney(change)})` : ''}.`,
  claimAgain: 'You can claim again this hour.',
  /** The "Next claim" field after a critical success: right now (once more), then the usual hour. */
  nextBonus: (unix: number) => `**Now**, once more. Then <t:${unix}:R>`,
  bonusFooter: 'A bonus claim from a critical success.',
};
