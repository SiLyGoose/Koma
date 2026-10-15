import { CHAT } from '../../constants/index.js';
import type { ChatClientMessage, ChatLine, ChatServerMessage } from '../../protocol/chat.js';

export type { ChatClientMessage, ChatLine, ChatServerMessage };

/*
 * The chat beside a game played together (what is said in it: ../../protocol/chat.ts). Each table keeps its own, in
 * memory: the last few lines, for whoever joins, and gone with the table. Nothing is kept in the database. A line's
 * GIF, for a tenor.com link in its words, is the one whose address the bot reads off that GIF's page (the link itself is
 * only to a page about it). A table keeps only its last few pasted pictures.
 */

/** A pasted picture: one of the kinds a page draws as a picture and nothing else (never SVG, which can hold a script). */
const PASTED = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
/** A link to a GIF's page on tenor.com, and the GIF's own address in that page. */
const TENOR_LINK = /https:\/\/tenor\.com\/(?:[a-z]{2}(?:-[A-Za-z]{2})?\/)?view\/[\w%-]+-\d+(?=$|[\s?#])/;
const TENOR_GIF = /<meta[^>]+property="og:image"[^>]+content="(https:\/\/media\d*\.tenor\.com\/[\w./%-]+\.gif)"/;
/** How many tenor.com pages' answers are remembered. */
const GIFS_KEPT = 500;

/**
 * Reads a `chat` message from the page (already parsed as JSON): its words tidied (runs of spaces and
 * line breaks made one space), and its picture if one was pasted. Null when it isn't one, or says
 * nothing, or too much, or its picture isn't one or is too big.
 */
export function parseChat(m: Record<string, unknown>): ChatClientMessage | null {
  if (m.t !== 'chat' || typeof m.text !== 'string' || m.text.length > CHAT.maxLength * 2) return null;
  // Control characters (line breaks among them) are spaces too.
  const text = m.text.replace(/[\s\p{Cc}]+/gu, ' ').trim();
  if (text.length > CHAT.maxLength) return null;
  if (m.image === undefined) return text.length === 0 ? null : { t: 'chat', text };
  if (typeof m.image !== 'string' || m.image.length > CHAT.maxImageLength || !PASTED.test(m.image)) return null;
  return { t: 'chat', text, image: m.image };
}

/** The GIF's address in a tenor.com page (`html`), if it says one. */
export function tenorGif(html: string): string | undefined {
  return TENOR_GIF.exec(html)?.[1];
}

/** The tenor.com pages asked about lately, and what each said (nothing, for one that didn't answer). */
const gifs = new Map<string, string | undefined>();

/**
 * The picture a line (as parseChat left it) is said with: the one pasted, or the GIF its first
 * tenor.com link is to (asked of tenor.com, which gets `gifMs` to answer), or none.
 */
export async function chatImage(message: ChatClientMessage): Promise<string | undefined> {
  if (message.image) return message.image;
  const link = TENOR_LINK.exec(message.text)?.[0];
  if (!link) return undefined;
  if (gifs.has(link)) return gifs.get(link);
  let gif: string | undefined;
  try {
    const res = await fetch(link, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; Koma)' }, signal: AbortSignal.timeout(CHAT.gifMs) });
    if (res.ok) gif = tenorGif(await res.text());
  } catch (err) {
    console.error(`Could not read a GIF’s page (${link}):`, err);
  }
  if (gifs.size >= GIFS_KEPT) gifs.clear();
  gifs.set(link, gif);
  return gif;
}

/** Whether a line's picture is one pasted in (kept by the table itself), not an address somewhere else. */
const pasted = (image: string | undefined): boolean => image?.startsWith('data:') === true;

/** One table's chat. */
export class Chat {
  private lines: ChatLine[] = [];
  private count = 0;
  /** When each member last said something. */
  private readonly lastAt = new Map<string, number>();

  /**
   * `who` says `text` (as parseChat left it), with `image` (chatImage's) or not. Returns the line, to
   * tell everyone at the table, or null when they spoke too soon after their last (the line is dropped).
   */
  say(who: { userId: string; name: string }, text: string, now: number, image?: string): ChatLine | null {
    const last = this.lastAt.get(who.userId);
    if (last !== undefined && now - last < (pasted(image) ? CHAT.imageGapMs : CHAT.gapMs)) return null;
    this.lastAt.set(who.userId, now);
    const line: ChatLine = { no: ++this.count, id: who.userId, name: who.name, text, ...(image ? { image } : {}), at: now };
    this.lines.push(line);
    if (this.lines.length > CHAT.keep) this.lines.shift();
    if (pasted(image)) this.forgetImages();
    return line;
  }

  /** Keeps only the last pasted pictures: a line before them loses its own, and goes if it said nothing else. */
  private forgetImages(): void {
    let kept = 0;
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const line = this.lines[i] as ChatLine;
      if (!pasted(line.image) || ++kept <= CHAT.keepImages) continue;
      if (line.text) this.lines[i] = { no: line.no, id: line.id, name: line.name, text: line.text, at: line.at };
      else this.lines.splice(i, 1);
    }
  }

  /** What to tell a page joining the table: the last lines said. */
  history(): ChatServerMessage {
    return { t: 'chats', lines: [...this.lines] };
  }
}
