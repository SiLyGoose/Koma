/*
 * The chat beside a game played together (the shared tables, poker, minesweeper and the TechnoMagic Raid): what the
 * players at one table (or in one room) say to each other while they play (the bot's web/games/chat.ts keeps it).
 *
 *   page -> bot   chat     says `text` to everyone at the table, with a picture pasted in (`image`) or not
 *   bot -> page   chats    the last lines said, on joining
 *                 chat     a line just said (the page's own too)
 *
 * A line can have a picture (`image`): one pasted into the page, which comes (and is kept, and told to everyone) as a
 * `data:` address, the page having made it small enough; or the GIF of a tenor.com link in the line's words. Links
 * straight to a picture the pages show themselves, from the line's words. A page only ever shows a line's words as
 * text, never as markup.
 */

/** Something said at a table. */
export interface ChatLine {
  /** Counts up with every line said at the table, so a page knows one it has shown. */
  no: number;
  /** Who said it: the member's id, and their name then. */
  id: string;
  name: string;
  text: string;
  /** Its picture: a pasted one (`data:image/…`), or a GIF's address (`https://…`). */
  image?: string;
  /** When (ms). */
  at: number;
}

export type ChatClientMessage = { t: 'chat'; text: string; image?: string };
export type ChatServerMessage = { t: 'chats'; lines: ChatLine[] } | { t: 'chat'; line: ChatLine };
