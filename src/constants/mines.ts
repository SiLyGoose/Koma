/*
 * The mine, played like Stake's Mines (see lib/game/mines.ts): a 5 by 5 board with as many mines
 * hidden in it as the player chooses, the rest gems.
 */

/** The board is this many tiles wide and tall. */
export const MINE_SIZE = 5;
export const MINE_TILES = MINE_SIZE * MINE_SIZE;

/** How many mines a round can have (at least one tile is a gem), and how many the page starts at. */
export const MINE_MINES = { min: 1, max: MINE_TILES - 1, start: 3 } as const;

/** The most the `mine.maxMultiplier` setting may be set to. */
export const MAX_MINE_MULTIPLIER = 10_000;

/**
 * How a run in the mine is kept:
 * - `idleMs`: a run nobody has pressed a button on for this long is cashed out by itself.
 * - `leaseMs`, `heartbeatMs`, `sweepMs`: like blackjack's (constants/blackjack.ts). A run is marked
 *   "in use" for `leaseMs`, renewed every `heartbeatMs` while it is played, and every `sweepMs` the
 *   bot cashes out runs whose mark ran out (the bot restarted during them), at the multiplier they had.
 */
export const MINE = {
  idleMs: 60_000,
  leaseMs: 90_000,
  heartbeatMs: 30_000,
  sweepMs: 60_000,
} as const;

/**
 * Playing the mine from the web page (src/web, and the Koma-UI repo), when MINE_WEB_URL is set:
 * - `path`: where the web socket listens (Caddy passes this path on to it).
 * - `defaultPort`: the port it listens on, on this machine only, unless MINE_WEB_PORT says otherwise.
 * - `linkTtlMs`: how long a link into a game works (the site asks for a new one each time it opens one).
 * - `helloMs`: how long a new connection has to say which run it is for.
 * - `messagesPerSecond` and `maxMessageBytes`: a connection sending more, or bigger, is cut off.
 * - `pingMs`: how often connections are checked; one that doesn't answer is dropped.
 */
export const MINE_WEB = {
  path: '/mine',
  defaultPort: 8787,
  linkTtlMs: 2 * 60 * 60_000,
  helloMs: 10_000,
  messagesPerSecond: 30,
  maxMessageBytes: 512,
  pingMs: 30_000,
} as const;
