import { DUCK_IDS, DUCKS, type Duck } from '../../protocol/duckrace.js';
import { TABLE_WEB } from './table.js';

export { DUCK_IDS, DUCKS, type Duck };

/*
 * The duck race, played on the games' site (see lib/game/casino/duckrace.ts for the rules,
 * web/games/duckrace/table.ts for the page's side). The bet range and what a win pays are settings
 * (`duckRace.*`); the shape of the game is here.
 */

/** The most the payout setting (to 1) may be set to. */
export const MAX_DUCK_RACE_PAYOUT = 100;

/** How many marks down the course each duck's pace is given at (the last is the finish line). */
export const DUCK_RACE_MARKS = 8;

/** Playing the duck race from its web page (the Koma-UI repo): `path` is where its web socket listens (and see TABLE_WEB). */
export const DUCK_RACE_WEB = {
  path: '/duckrace',
  ...TABLE_WEB,
} as const;

/**
 * The shared tables (web/games/duckrace/table.ts, like roulette's). Members opening the duck race are
 * seated at the first table in their server with a free seat.
 * - `seats`: how many players a table holds.
 * - `bettingMs`: how long each round's betting lasts; when it's up the ducks race, settling everyone
 *   with chips down (they race even with no chips on the table).
 * - `showMs`: how long after the race starts before the next round's betting. The page runs the race
 *   for about 9s, then shows how everyone did for the rest of it.
 * - `recent`: how many of the last winners the table shows.
 * - `awayMs`: how long a player whose page went away (a reload, a phone switching apps) keeps their seat.
 */
export const DUCK_RACE_TABLE = {
  seats: 8,
  bettingMs: 30_000,
  showMs: 14_000,
  recent: 12,
  awayMs: 60_000,
} as const;
