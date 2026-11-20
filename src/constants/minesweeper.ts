import { MINESWEEPER_LEVEL_IDS, type MinesweeperLevel } from '../protocol/minesweeper.js';

/*
 * Minesweeper, played together on the games' site (lib/game/minesweeper.ts for the rules,
 * web/games/minesweeper/ for the rooms). No bet: a server's members clear one board between them,
 * and a board cleared pays its level's pool of points, shared between them by the tiles each opened
 * and more the faster it was cleared. What the levels pay, their par times and the most that speed
 * adds are settings (`minesweeper.*`).
 */

export { MINESWEEPER_LEVEL_IDS, type MinesweeperLevel };

/** The boards: how many tiles across and down, and how many of them are mines (the classic three). */
export const MINESWEEPER_LEVELS = {
  easy: { cols: 9, rows: 9, mines: 10 },
  medium: { cols: 16, rows: 16, mines: 40 },
  hard: { cols: 30, rows: 16, mines: 99 },
} as const satisfies Record<MinesweeperLevel, { cols: number; rows: number; mines: number }>;

/** The most the settings may be set to: a level's par time (seconds), and what the pool is multiplied by for speed. */
export const MAX_MINESWEEPER_PAR_SECONDS = 24 * 60 * 60;
export const MAX_MINESWEEPER_SPEED_BONUS = 10;

/** How many of a server's fastest clears each level's leaderboard keeps. */
export const MINESWEEPER_BEST = 10;

/** The board a room starts on. */
export const MINESWEEPER_START: MinesweeperLevel = 'easy';

/** What the levels are called, on the page and in Discord. */
export const MINESWEEPER_LEVEL_NAMES: Record<MinesweeperLevel, string> = { easy: 'Beginner', medium: 'Intermediate', hard: 'Expert' };

/**
 * Playing it from its web page (the Koma-UI repo): `path` is where its web socket listens.
 * `messagesPerSecond` is higher than the other games': a page says where its mouse is as it moves
 * (about 20 times a second), on top of its clicks.
 */
export const MINESWEEPER_WEB = {
  path: '/minesweeper',
  helloMs: 10_000,
  messagesPerSecond: 60,
} as const;

/**
 * A server's room (web/games/minesweeper/room.ts):
 * - `players`: the most pages in it at once.
 * - `colours`: how many colours the page tells players apart by (their cursors and names); with more
 *   players than that, colours are shared.
 */
export const MINESWEEPER_ROOM = {
  players: 16,
  colours: 8,
} as const;
