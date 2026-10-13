import { CHAT } from '../../constants/index.js';

/*
 * The chat beside a game played together (the shared tables, poker and minesweeper): what the players
 * at one table (or in one room) say to each other while they play. Each table keeps its own, in
 * memory: the last few lines, for whoever joins, and gone with the table. Nothing is kept in the
 * database.
 *
 *   page -> bot   chat     says `text` to everyone at the table
 *   bot -> page   chats    the last lines said, on joining
 *                 chat     a line just said (the page's own too)
 *
 * The pages keep a copy of these types (src/shared/ui/chat/chat.ts in the Koma-UI repo): change both
 * together. A page only ever shows a line's words as text, never as markup.
 */

/** Something said at a table. */
export interface ChatLine {
  /** Counts up with every line said at the table, so a page knows one it has shown. */
  no: number;
  /** Who said it: the member's id, and their name then. */
  id: string;
  name: string;
  text: string;
  /** When (ms). */
  at: number;
}

export type ChatClientMessage = { t: 'chat'; text: string };
export type ChatServerMessage = { t: 'chats'; lines: ChatLine[] } | { t: 'chat'; line: ChatLine };

/**
 * Reads a `chat` message from the page (already parsed as JSON): its words tidied (runs of spaces and
 * line breaks made one space). Null when it isn't one, or says nothing, or too much.
 */
export function parseChat(m: Record<string, unknown>): ChatClientMessage | null {
  if (m.t !== 'chat' || typeof m.text !== 'string' || m.text.length > CHAT.maxLength * 2) return null;
  // Control characters (line breaks among them) are spaces too.
  const text = m.text.replace(/[\s\p{Cc}]+/gu, ' ').trim();
  if (text.length === 0 || text.length > CHAT.maxLength) return null;
  return { t: 'chat', text };
}

/** One table's chat. */
export class Chat {
  private lines: ChatLine[] = [];
  private count = 0;
  /** When each member last said something. */
  private readonly lastAt = new Map<string, number>();

  /**
   * `who` says `text` (as parseChat left it). Returns the line, to tell everyone at the table, or
   * null when they spoke too soon after their last (the line is dropped).
   */
  say(who: { userId: string; name: string }, text: string, now: number): ChatLine | null {
    const last = this.lastAt.get(who.userId);
    if (last !== undefined && now - last < CHAT.gapMs) return null;
    this.lastAt.set(who.userId, now);
    const line: ChatLine = { no: ++this.count, id: who.userId, name: who.name, text, at: now };
    this.lines.push(line);
    if (this.lines.length > CHAT.keep) this.lines.shift();
    return line;
  }

  /** What to tell a page joining the table: the last lines said. */
  history(): ChatServerMessage {
    return { t: 'chats', lines: [...this.lines] };
  }
}
