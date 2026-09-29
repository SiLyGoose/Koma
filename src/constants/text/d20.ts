import { boldMoney } from './currency.js';

export const d20Text = {
  /** Shown while the die is still tumbling. `user` is a mention. */
  spinningTitle: 'The die is rolling...',
  spinning: (user: string) => `${user} rolls the D20...`,
  failTitle: 'Critical fail!',
  successTitle: 'Critical success!',
  /**
   * A claim that rolled a 1: the whole claim text. `bonus` is what the d3 rolled, `paid` what the
   * member paid the vault (like "1,200"); empty when they had nothing to pay with.
   */
  fail: (user: string, roll: number, bonus: number, paid: string) =>
    `${user} rolled a **${roll}** on the D20. Critical fail! Nothing to claim this hour, and the d3 rolled **${bonus}**: ${
      paid ? `${boldMoney(paid)} paid to the vault.` : 'luckily there was nothing to pay the vault with.'
    }`,
  /** Added under a claim that rolled 2 up to one below the top. `multiplier` is like "1.3x". */
  /** `change` is what the die did to the points with its sign, like "+30" or "-40"; left out when it changed nothing. */
  landed: (roll: number, multiplier: string, change = '') => `The D20 landed on **${roll}**: **${multiplier}**${change ? ` (${boldMoney(change)})` : ''}.`,
  /** Added under a claim or rob that rolled the top number. `bonus` is what the d3 rolled, `multiplier` like "3x". */
  critical: (roll: number, bonus: number, multiplier: string, change = '') =>
    `Critical success! The D20 landed on **${roll}**, and the d3 rolled **${bonus}**: **${multiplier}**${change ? ` (${boldMoney(change)})` : ''}.`,
  /**
   * Above a rob that rolled a 1: caught, whatever the odds. `bonus` is what the d3 rolled,
   * `multiplier` like "3x", `extra` what it added to the fine (like "+400"); left out when it added nothing.
   */
  robFail: (roll: number, bonus: number, multiplier: string, extra = '') =>
    `The D20 landed on **${roll}**. Critical fail! No way this rob works, and the d3 rolled **${bonus}**: **${multiplier}** fine${extra ? ` (${boldMoney(extra)})` : ''}.`,
  /** Above a rob that rolled 2 up to one below the top. `multiplier` like "0.7x", `chance` the chance after it, like "35%". */
  robLanded: (roll: number, multiplier: string, chance: string) => `The D20 landed on **${roll}**: **${multiplier}** success chance (**${chance}**).`,
};
