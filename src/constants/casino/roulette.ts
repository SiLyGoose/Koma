import { TABLE_WEB } from './table.js';

/*
 * Roulette, played on the games' site (see lib/game/casino/roulette.ts for the rules, web/roulette/table.ts
 * for the page's side). The bet range is a setting (`roulette.*`); the shape of the game is here.
 */

/** The red numbers (the rest of 1 to 36 are black, and 0 and 00 are green). */
export const ROULETTE_RED: readonly number[] = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

/** The outside bets: even money (red, black, odd, even, low, high), and the dozens and columns (2 to 1). */
export const ROULETTE_OUTSIDE = ['red', 'black', 'odd', 'even', 'low', 'high', 'dozen1', 'dozen2', 'dozen3', 'column1', 'column2', 'column3'] as const;
export type RouletteOutside = (typeof ROULETTE_OUTSIDE)[number];

/** Playing roulette from its web page (the Koma-UI repo): `path` is where its web socket listens (and see TABLE_WEB). */
export const ROULETTE_WEB = {
  path: '/roulette',
  ...TABLE_WEB,
} as const;

/**
 * The shared tables (web/roulette/table.ts, like baccarat's). Members opening roulette are seated at
 * the first table in their server with a free seat.
 * - `seats`: how many players a table holds.
 * - `bettingMs`: how long each round's betting lasts; when it's up the wheel is spun for everyone
 *   with chips down (a round with no chips on the table isn't spun, the betting just starts over).
 * - `showMs`: how long after a spin before the next round's betting starts. The page spins the wheel
 *   for about 7s, then shows how everyone did for the rest of it.
 * - `recent`: how many of the last numbers the table shows.
 */
export const ROULETTE_TABLE = {
  seats: 8,
  bettingMs: 45_000,
  showMs: 12_000,
  recent: 12,
} as const;
