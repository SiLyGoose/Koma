/*
 * Baccarat, played on the games' site (see lib/game/baccarat.ts for the rules, web/baccarat-server.ts
 * for the page's side). What the bets pay are settings (`baccarat.*`); the shape of the game is here.
 */

/** The spots a bet can go on: the three main bets, and the two side bets. */
export const BACCARAT_BETS = ['player', 'banker', 'tie', 'kirin', 'phoenix'] as const;
export type BaccaratBet = (typeof BACCARAT_BETS)[number];

/** Every round is dealt from a freshly shuffled shoe of this many decks. */
export const BACCARAT_DECKS = 8;

/** The most a "to 1" payout setting (tie, Kirin, Phoenix) may be set to. */
export const MAX_BACCARAT_PAYOUT = 1000;

/** The chips the page offers, smallest first. Any whole number can be bet; these are what the page stacks. */
export const BACCARAT_CHIPS = [1, 5, 25, 100, 500, 1000, 5000] as const;

/**
 * Playing baccarat from its web page (the Koma-UI repo):
 * - `path`: where its web socket listens.
 * - `helloMs`: how long a new connection has to say who it is.
 * - `messagesPerSecond`: a connection sending more is cut off.
 * - `dealMs`: the shortest time between two rounds for one player (the page deals the cards out in
 *   about this long, so a round can't be played faster than it can be seen).
 */
export const BACCARAT_WEB = {
  path: '/baccarat',
  helloMs: 10_000,
  messagesPerSecond: 20,
  dealMs: 2_500,
} as const;
