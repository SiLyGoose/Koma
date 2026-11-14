/*
 * The chat beside the games played together on the site (web/games/chat.ts): the shared tables, poker
 * and minesweeper.
 * - `maxLength`: the most characters one line can have.
 * - `keep`: how many of the last lines a table keeps, for whoever joins.
 * - `gapMs`: the least time between two lines from one member; one said sooner is dropped.
 * - `maxImageLength`: the most characters a pasted picture can have (as a `data:` address, about three
 *   quarters of that in bytes); the page makes a picture smaller until it fits.
 * - `imageGapMs`: the least time after a member's last line before they can say one with a pasted picture.
 * - `keepImages`: how many of the last pasted pictures a table keeps; the ones before go from its lines.
 * - `gifMs`: how long a GIF's page (a tenor.com link) gets to say where its picture is.
 */
export const CHAT = {
  maxLength: 400,
  keep: 50,
  gapMs: 500,
  maxImageLength: 200_000,
  imageGapMs: 2000,
  keepImages: 10,
  gifMs: 4000,
} as const;
