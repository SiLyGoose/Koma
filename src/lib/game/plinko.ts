import { PLINKO_ROWS } from '../../constants/index.js';

/*
 * The rules of plinko, with no database and no pictures. A ball is dropped on a board of
 * PLINKO_ROWS rows of pegs and bounces left or right at every row, so after `rows` bounces it
 * lands in one of `rows + 1` slots: the slot number is how many times it went right. The
 * middle slots are reached far more often than the edges, so the edges pay the most.
 *
 * The payouts are mirrored: the settings hold one multiplier per slot counting in from the edge
 * (1 is the two outermost slots), and slot `s` on the board uses number `min(s, rows - s) + 1`.
 */

/** A path is one entry per row: true when the ball bounced right, false when it bounced left. */
export type PlinkoPath = readonly boolean[];

/** How many slots the board has. */
export const slotCount = (rows: number = PLINKO_ROWS): number => rows + 1;

/** Drops a ball: `goesRight` says which way it bounces at each row (a fair coin in the real game). */
export function rollPath(goesRight: () => boolean, rows: number = PLINKO_ROWS): boolean[] {
  return Array.from({ length: rows }, () => goesRight());
}

/** The slot a ball ends in, counted from the left starting at 0: how many times it bounced right. */
export const slotOf = (path: PlinkoPath): number => path.filter(Boolean).length;

/** The payout multiplier of one slot (0 up to `rows`), from the mirrored settings. */
export function slotMultiplier(payout: Readonly<Record<number, number>>, slot: number, rows: number = PLINKO_ROWS): number {
  if (!Number.isInteger(slot) || slot < 0 || slot > rows) throw new Error(`There is no slot ${slot} on a board with ${rows} rows`);
  const multiplier = payout[Math.min(slot, rows - slot) + 1];
  if (typeof multiplier !== 'number') throw new Error(`No payout is set for slot ${slot}`);
  return multiplier;
}

/** The payout multiplier of every slot, left to right. */
export function slotMultipliers(payout: Readonly<Record<number, number>>, rows: number = PLINKO_ROWS): number[] {
  return Array.from({ length: slotCount(rows) }, (_, slot) => slotMultiplier(payout, slot, rows));
}

/** What a bet pays at a multiplier, in whole points (rounded to the nearest). */
export const payoutFor = (bet: number, multiplier: number): number => Math.round(bet * multiplier);

/** "n choose k". */
function choose(n: number, k: number): number {
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return Math.round(result);
}

/** The chance a ball ends in each slot, left to right (they add up to 1). */
export function slotChances(rows: number = PLINKO_ROWS): number[] {
  const total = 2 ** rows;
  return Array.from({ length: slotCount(rows) }, (_, slot) => choose(rows, slot) / total);
}

/**
 * What a bet is paid back on average, as a fraction of the bet: 1 breaks even over many games,
 * below 1 means the house wins in the long run.
 */
export function expectedReturn(payout: Readonly<Record<number, number>>, rows: number = PLINKO_ROWS): number {
  const chances = slotChances(rows);
  return chances.reduce((sum, chance, slot) => sum + chance * slotMultiplier(payout, slot, rows), 0);
}

/**
 * How far right of the middle the ball is after `frame` bounces, in slot widths (negative is left):
 * the bounces to the right minus half the bounces so far. After all the rows this is the middle
 * of the slot it landed in.
 */
export function ballOffset(path: PlinkoPath, frame: number): number {
  if (!Number.isInteger(frame) || frame < 0 || frame > path.length) throw new Error(`The ball has no frame ${frame}`);
  let rights = 0;
  for (let i = 0; i < frame; i++) if (path[i]) rights++;
  return rights - frame / 2;
}

export type BetArg = { ok: true; bet: number | 'all' } | { ok: false; error: 'usage' | 'bad_bet' };

/** Reads the words after `plinko`: one whole number of points, or "all" (or "max") for as much as allowed. */
export function parseBetArg(args: readonly string[]): BetArg {
  if (args.length !== 1) return { ok: false, error: 'usage' };
  const text = (args[0] as string).trim().toLowerCase();
  if (text === 'all' || text === 'max') return { ok: true, bet: 'all' };
  if (!/^\d[\d,_]*$/.test(text)) return { ok: false, error: 'bad_bet' };
  const bet = Number(text.replace(/[,_]/g, ''));
  if (!Number.isSafeInteger(bet) || bet < 1) return { ok: false, error: 'bad_bet' };
  return { ok: true, bet };
}

export type BetCheck = { ok: true } | { ok: false; reason: 'too_small' | 'too_big'; limit: number };

/** Whether a bet is within the allowed range. */
export function checkBet(bet: number, minBet: number, maxBet: number): BetCheck {
  if (bet < minBet) return { ok: false, reason: 'too_small', limit: minBet };
  if (bet > maxBet) return { ok: false, reason: 'too_big', limit: maxBet };
  return { ok: true };
}

/** What the buttons under a finished game do: the bet they would place, and whether it is possible now. */
export interface ButtonPlan {
  again: { bet: number; enabled: boolean };
  double: { bet: number; enabled: boolean };
  half: { bet: number; enabled: boolean };
}

/**
 * The three buttons for a finished game with `bet`, given what the member has left. A button is
 * on only when its bet is in range and they can pay it (half a bet is rounded down).
 */
export function buttonPlan(bet: number, balance: number, minBet: number, maxBet: number): ButtonPlan {
  const plan = (next: number) => ({ bet: next, enabled: next >= minBet && next <= maxBet && next <= balance });
  return { again: plan(bet), double: plan(bet * 2), half: plan(Math.floor(bet / 2)) };
}
