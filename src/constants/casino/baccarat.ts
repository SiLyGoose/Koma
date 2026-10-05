import { TABLE_CHIPS, TABLE_WEB } from './table.js';

/*
 * Baccarat, played on the games' site (see lib/game/casino/baccarat.ts for the rules, web/baccarat/server.ts
 * for the page's side). What the bets pay are settings (`baccarat.*`); the shape of the game is here.
 */

/** The spots a bet can go on: the three main bets, and the two side bets. */
export const BACCARAT_BETS = ['player', 'banker', 'tie', 'kirin', 'phoenix'] as const;
export type BaccaratBet = (typeof BACCARAT_BETS)[number];

/** Every round is dealt from a freshly shuffled shoe of this many decks. */
export const BACCARAT_DECKS = 8;

/** The most a "to 1" payout setting (tie, Kirin, Phoenix) may be set to. */
export const MAX_BACCARAT_PAYOUT = 1000;

/** The chips the page offers (every table game's). */
export const BACCARAT_CHIPS = TABLE_CHIPS;

/** Playing baccarat from its web page (the Koma-UI repo): `path` is where its web socket listens (and see TABLE_WEB). */
export const BACCARAT_WEB = {
  path: '/baccarat',
  ...TABLE_WEB,
} as const;

/**
 * The shared tables (web/baccarat/table.ts). Members opening baccarat are seated at the first table
 * in their server with a free seat.
 * - `seats`: how many players a table holds.
 * - `bettingMs`: how long each round's betting lasts; when it's up the round is dealt, settling
 *   everyone with chips down (it's dealt even with no chips on the table).
 * - `showMs`: how long after a deal before the next round's betting starts. The page deals the cards
 *   out one by one (3.4s for the first four, a 1.6s pause, and up to two third cards: about 6.3s
 *   at most), then shows how everyone did for the rest of it.
 * - `history`: how many hands the table's scoreboard holds (the roads the page draws: bead plate,
 *   big road and the three derived roads). 72 fills a 6 by 12 bead plate; the hand after that starts
 *   a clean scoreboard, as a casino's does with each new shoe.
 */
export const BACCARAT_TABLE = {
  seats: 8,
  bettingMs: 60_000,
  showMs: 12_000,
  history: 72,
} as const;
