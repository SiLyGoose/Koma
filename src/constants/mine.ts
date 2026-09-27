/*
 * The mine (a 5 by 5 field of ores and dynamite, see lib/game/mine.ts).
 */

/** File name of the mine field picture. */
export const MINE_IMAGE_NAME = 'mine.png';

/** The field is this many tiles wide and tall. It must be odd, so the miner can start in the middle. */
export const MINE_SIZE = 5;

/** The ores, from the most common and least valuable to the rarest. What each adds is the `mine.value.<ore>` setting. */
export const MINE_ORES = ['coal', 'iron', 'gold', 'diamond'] as const;
export type MineOre = (typeof MINE_ORES)[number];

/** How often each ore turns up compared with the others: an ore tile is coal 50 times in 100, a diamond 5. */
export const MINE_ORE_WEIGHTS: Readonly<Record<MineOre, number>> = { coal: 50, iron: 30, gold: 15, diamond: 5 };

/**
 * The most dynamite a field can be set to have (of the 24 tiles around the middle). Every field is
 * laid out so its other tiles can all be reached; with more dynamite than this, few layouts are.
 */
export const MAX_MINE_DYNAMITE = 18;

/** The mine's ore values and field bonus are multipliers of the bet, up to this much each. */
export const MAX_MINE_MULTIPLIER = 100;

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
 * - `linkTtlMs`: how long a "play in the browser" link works (a new one comes with every press of the button).
 * - `lobbyButtonMs`: how long the Open button under `k!mine` with no bet keeps working.
 * - `helloMs`: how long a new connection has to say which run it is for.
 * - `messagesPerSecond` and `maxMessageBytes`: a connection sending more, or bigger, is cut off.
 * - `pingMs`: how often connections are checked; one that doesn't answer is dropped.
 */
export const MINE_WEB = {
  path: '/mine',
  defaultPort: 8787,
  linkTtlMs: 2 * 60 * 60_000,
  lobbyButtonMs: 15 * 60_000,
  helloMs: 10_000,
  messagesPerSecond: 30,
  maxMessageBytes: 512,
  pingMs: 30_000,
} as const;
