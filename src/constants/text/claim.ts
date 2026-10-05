import { boldMoney } from './currency.js';

export const claimText = {
  already: (unix: number) => `You already claimed this hour. Come back <t:${unix}:R>`,
  title: 'Hourly claim',
  /** A claim with nothing but the roll to it. */
  claimed: (user: string, amount: string) => `${user} claimed ${boldMoney(amount)}`,

  /*
   * A claim with effects on it reads as a receipt (commands/claim.ts claimReceipt), like a rob's: the
   * headline, one line per effect in the order it was applied, what was claimed, what changed it after
   * that (a claim tax, a D20 penalty) and what the member kept. The lines it shares with a rob's are in
   * receipt.ts.
   */
  receiptHeadline: (user: string) => `**${user} claimed!**`,
  /** Instead of the headline when the D20 rolled a critical fail. */
  receiptFailHeadline: (user: string) => `**${user}'s claim fell through!**`,
  /** What was rolled before any gear. */
  receiptRolled: (amount: string) => `💸 Rolled ${boldMoney(amount)}`,
  /** The D20 rolled 2 or up: `multiplier` like "1.3x", or the bonus die's like "3x" on a critical success. */
  receiptD20Added: (roll: number, multiplier: string, amount: string) => `🎲 D20 rolled ${roll} (${multiplier}) added ${boldMoney(amount)}`,
  receiptD20Cut: (roll: number, multiplier: string, amount: string) => `🎲 D20 rolled ${roll} (${multiplier}) took ${boldMoney(amount)}`,
  receiptD20Nothing: (roll: number, multiplier: string) => `🎲 D20 rolled ${roll} (${multiplier}) changed nothing.`,
  /** The D20 rolled a critical fail: the whole claim is gone. */
  receiptD20Fail: (roll: number, amount: string) => `🎲 D20 rolled ${roll}, a critical fail, and took all ${boldMoney(amount)}`,
  /** STONKS!: `multiplier` from how long since the last claim, like "6.3x". */
  receiptStonks: (multiplier: string, amount: string) => `📈 STONKS! (${multiplier}) added ${boldMoney(amount)}`,
  /** A Coughing Baby wearer who robbed the member took part of this claim. `taker` is a mention. */
  receiptTaxPaid: (taker: string, amount: string) => `👶 Claim tax: ${taker} took ${boldMoney(amount)}`,
  receiptClaimed: (amount: string) => `You claimed ${boldMoney(amount)}`,
  receiptClaimedNothing: 'You claimed nothing.',
  /** After a critical fail: what the bonus die rolled (`multiplier` like "3x") and what the member paid the vault. */
  receiptPenalty: (bonus: number, multiplier: string, amount: string) =>
    `🎲 The d3 rolled ${bonus} (${multiplier}): you paid the vault ${boldMoney(amount)}`,
  /** After a critical fail, when the member had nothing to pay the vault with. */
  receiptPenaltyNothing: (bonus: number) => `🎲 The d3 rolled ${bonus}, but you had nothing to pay the vault with.`,
  receiptKept: (amount: string) => `You kept ${boldMoney(amount)}`,
  receiptLost: (amount: string) => `You lost ${boldMoney(amount)}`,
  balanceField: 'Balance',
  nextField: 'Next claim',
  next: (unix: number) => `<t:${unix}:R>`,
};
