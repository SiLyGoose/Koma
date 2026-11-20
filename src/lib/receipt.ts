import { TEXT } from '../constants/index.js';
import { fmt, formatMultiplier } from './format.js';

/*
 * What a rob's and a claim's receipts are built from (commands/rob.ts, commands/claim.ts): one line
 * per effect on the amount, in the order it was applied, then the totals under a rule.
 */

/** A receipt line: its text, and what it added to the amount (negative when it took some off). */
export type ReceiptLine = [text: string, amount: number];

/** What a unique treasure did to an amount: its name, and what it added (negative when it cut it). */
export interface TreasureStep {
  name: string;
  amount: number;
}

/** The lines for the member's weapon and armor (`gear`), then their unique treasure. None for what changed nothing. */
export function gearLines(gear: number, treasure: TreasureStep | null): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  if (gear > 0) lines.push([TEXT.receipt.gearAdded(fmt(gear)), gear]);
  if (gear < 0) lines.push([TEXT.receipt.gearCut(fmt(-gear)), gear]);
  if (treasure !== null && treasure.amount > 0) lines.push([TEXT.receipt.treasureAdded(treasure.name, fmt(treasure.amount)), treasure.amount]);
  if (treasure !== null && treasure.amount < 0) lines.push([TEXT.receipt.treasureCut(treasure.name, fmt(-treasure.amount)), treasure.amount]);
  return lines;
}

/** The wheel's line: its multiplier, and what it added or took (`bonus`). */
export function wheelLine(multiplier: number, bonus: number): ReceiptLine {
  const shown = formatMultiplier(multiplier);
  const text = bonus > 0 ? TEXT.receipt.wheelAdded(shown, fmt(bonus)) : bonus < 0 ? TEXT.receipt.wheelCut(shown, fmt(-bonus)) : TEXT.receipt.wheelNothing(shown);
  return [text, bonus];
}

/** The sum of what the lines added, on top of `start`. */
export const addUp = (lines: readonly ReceiptLine[], start = 0): number => lines.reduce((sum, [, amount]) => sum + amount, start);
