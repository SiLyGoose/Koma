/*
 * What every shared-table game (baccarat, roulette) does with chips on its spots, with no database:
 * reading them from the page, adding them up, and what a round's bets gave back and lost.
 */

/** Points on each spot (left out or 0: no bet there). */
export type SpotBets<S extends string = string> = Partial<Record<S, number>>;

/** How a bet came out: won (pays its odds), push (the bet comes back) or lost. */
export type BetOutcome = 'win' | 'push' | 'lose';

/** One bet on the table, and how it came out. */
export interface SettledBet<S extends string = string> {
  spot: S;
  amount: number;
  outcome: BetOutcome;
  /** What it gave back, the bet included (0 when lost). */
  returned: number;
}

/** The points on the table. */
export const sumBets = (bets: SpotBets): number => Object.values<number | undefined>(bets).reduce<number>((sum, amount) => sum + Math.max(0, amount ?? 0), 0);

/** What a bet of `amount` at `odds` to 1 gives back (the bet included): the bet times 1 + its odds on a win, the bet on a push, 0 on a loss. */
export function returnAt(amount: number, odds: number, outcome: BetOutcome): number {
  if (outcome === 'lose') return 0;
  if (outcome === 'push') return amount;
  return Math.floor(amount * (1 + odds) + 1e-9);
}

/**
 * The points lost on losing bets, each counted on its own: a side bet that loses is lost even when
 * the bet beside it wins. What goes into the vault (pushes and wins give their chips back).
 */
export const lostChips = (settled: readonly SettledBet[]): number => settled.reduce((sum, b) => sum + (b.outcome === 'lose' ? b.amount : 0), 0);

/**
 * Reads bets from the page: an object of spot to whole points. Null when it isn't one (a spot
 * `isSpot` doesn't know, or a bet that isn't a whole number from 0 up). Spots at 0 are left out, so
 * `{}` is no bets.
 */
export function parseSpotBets<S extends string>(data: unknown, isSpot: (spot: string) => spot is S): SpotBets<S> | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const bets: SpotBets<S> = {};
  for (const [spot, amount] of Object.entries(data as Record<string, unknown>)) {
    if (!isSpot(spot)) return null;
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0) return null;
    if (amount > 0) bets[spot] = amount;
  }
  return bets;
}
