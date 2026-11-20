import { SLOT_EMOJI } from '../formatting.js';
import { boldMoney } from './currency.js';

/*
 * The lines a rob's and a claim's receipts share (lib/receipt.ts): what the member's gear and the
 * wheel did to the amount. Each line is a sentence with its amount in it; a line ending in an emoji or
 * a parenthesis gets no period.
 */
export const receiptText = {
  /** Between the steps and the totals. */
  rule: '━━━━━━━━━━',
  /** The member's weapon and armor made the amount bigger (or, on a caught rob, the fine). */
  gearAdded: (amount: string) => `🗡️ Gear added ${boldMoney(amount)}`,
  /** The member's weapon and armor made the amount smaller (a cut, like a robAmountCut). */
  gearCut: (amount: string) => `🗡️ Gear reduced ${boldMoney(amount)}`,
  /** The member's unique treasure made the amount bigger. `name` is the item's. */
  treasureAdded: (name: string, amount: string) => `${SLOT_EMOJI.treasure} ${name} added ${boldMoney(amount)}`,
  treasureCut: (name: string, amount: string) => `${SLOT_EMOJI.treasure} ${name} reduced ${boldMoney(amount)}`,
  wheelAdded: (multiplier: string, amount: string) => `🎡 Wheel (${multiplier}) added ${boldMoney(amount)}`,
  wheelCut: (multiplier: string, amount: string) => `🎡 Wheel (${multiplier}) took ${boldMoney(amount)}`,
  /** The wheel landed on 1x. */
  wheelNothing: (multiplier: string) => `🎡 Wheel (${multiplier}) changed nothing.`,
};
