import { TABLE_WEB } from './table.js';

/*
 * Texas hold'em, played on the games' site (lib/game/casino/poker/ for the rules, web/games/poker/ for
 * the tables). The stakes and the rake are settings (`poker.*`); the shape of the game is here.
 */

/** Playing poker from its web page (the Koma-UI repo): `path` is where its web socket listens (and see TABLE_WEB). */
export const POKER_WEB = {
  path: '/poker',
  ...TABLE_WEB,
} as const;

/**
 * The poker tables (web/games/poker/table.ts). Members opening poker join the table they sit at, or
 * the first in their server with a free seat; a new table opens when every one is full.
 * - `seats`: how many players (people and bots) a table seats.
 * - `nextHandMs`: the pause between one hand ending and the next being dealt (the winners show).
 * - `streetMs`: the pause between a betting round ending and the next card coming (longer once the
 *   cards are face up with everyone all in, so each card lands on its own).
 * - `allInStreetMs`: that longer pause.
 * - `awayMs`: how long a player whose page went away keeps their seat; after that (once they aren't
 *   in a hand) they are cashed out. While they are away their turns are played for them at once:
 *   a check when it's free, otherwise a fold.
 * - `botThinkMs`: how long a bot takes over a move, from and to (so it reads like a player).
 * - `leaseMs`, `heartbeatMs`, `sweepMs`: a seat's chips are kept in the database
 *   (services/casino/poker.ts) with a lease the table renews every `heartbeatMs`; chips whose lease
 *   ran out (the bot stopped) are given back by a sweep every `sweepMs`.
 */
export const POKER_TABLE = {
  seats: 8,
  nextHandMs: 6_000,
  streetMs: 900,
  allInStreetMs: 1_800,
  awayMs: 60_000,
  botThinkMs: [900, 2_600] as const,
  leaseMs: 60_000,
  heartbeatMs: 15_000,
  sweepMs: 30_000,
} as const;

/** The names the bots sit down under, in the order they are picked (the first not already at the table). */
export const POKER_BOT_NAMES = ['Chip', 'Ace', 'Lucky', 'Dealer Dan', 'River Rat', 'Big Blind Betty', 'Pocket Rockets', 'Nuts'] as const;

/** The most a poker stake setting can be. */
export const MAX_POKER_STAKE = 1_000_000;
/** The longest a poker turn setting can be, in seconds. */
export const MAX_POKER_TURN_SECONDS = 300;
