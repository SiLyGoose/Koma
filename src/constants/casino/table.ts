/*
 * What every game played at shared tables (baccarat, roulette: web/games/table/table.ts) has in common.
 */

/** The chips the pages offer, smallest first. Any whole number can be bet; these are what the pages stack. */
export const TABLE_CHIPS = [1, 5, 25, 100, 500, 1000, 5000] as const;

/**
 * Playing from a table game's web page (the Koma-UI repo):
 * - `helloMs`: how long a new connection has to say who it is.
 * - `messagesPerSecond`: a connection sending more is cut off.
 */
export const TABLE_WEB = {
  helloMs: 10_000,
  messagesPerSecond: 20,
} as const;
