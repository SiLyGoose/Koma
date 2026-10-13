/*
 * The chat beside the games played together on the site (web/games/chat.ts): the shared tables, poker
 * and minesweeper.
 * - `maxLength`: the most characters one line can have.
 * - `keep`: how many of the last lines a table keeps, for whoever joins.
 * - `gapMs`: the least time between two lines from one member; one said sooner is dropped.
 */
export const CHAT = {
  maxLength: 200,
  keep: 50,
  gapMs: 500,
} as const;
