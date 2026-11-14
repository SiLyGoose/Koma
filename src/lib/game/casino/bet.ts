/*
 * What every game that takes a bet shares (blackjack, plinko), with no database and no Discord:
 * reading the bet, checking it against the game's range, and the again / double / half buttons
 * under a finished game.
 */

export type BetArg = { ok: true; bet: number | 'all' } | { ok: false; error: 'usage' | 'bad_bet' };

/** Reads the words after the command: one whole number of points, or "all" (or "max") for as much as allowed. */
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

/** Why a bet was turned down: out of range (`limit` is the one it broke), or more than the member has. Nothing was taken. */
export type BetRefusal = Exclude<BetCheck, { ok: true }> | { ok: false; reason: 'too_poor'; balance: number };

/** The bet an "all" means: as much as they have, up to the biggest bet (and at least the smallest, so they are told what a bet costs). */
export const allBet = (points: number, minBet: number, maxBet: number): number => Math.max(minBet, Math.min(points, maxBet));

/** The custom ids of a game's again / double / half buttons. Each game has its own so their buttons never mix. */
export interface BetButtonIds {
  again: string;
  double: string;
  half: string;
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

/** The bet a button asks for, from the bet of the game it is under; null for any other button. */
export function betForButton(ids: BetButtonIds, customId: string, bet: number): number | null {
  if (customId === ids.again) return bet;
  if (customId === ids.double) return bet * 2;
  if (customId === ids.half) return Math.floor(bet / 2);
  return null;
}

/** Whether a custom id is one of the three bet buttons. */
export const isBetButton = (ids: BetButtonIds, customId: string): boolean => betForButton(ids, customId, 0) !== null;
