import { MINESWEEPER_LEVELS } from '../../../constants/index.js';
import type { ClientMessage, MinesweeperLevel } from '../../../protocol/minesweeper.js';
import { parseChat } from '../chat.js';

export * from '../../../protocol/minesweeper.js';

/* The page's messages as the bot reads them: what each says is ../../../protocol/minesweeper.ts (the site keeps a copy). */

/** The widest and tallest any board is: a cursor is somewhere within it. */
const MAX_SPAN = Math.max(...Object.values(MINESWEEPER_LEVELS).flatMap((l) => [l.cols, l.rows]));
const within = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= MAX_SPAN;
const count = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

/** Reads a message from the page. Null when it isn't a valid one. */
export function parseClientMessage(text: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  if (m.t === 'hello' && typeof m.token === 'string' && m.token.length <= 512) return { t: 'hello', token: m.token };
  if (m.t === 'new' && typeof m.level === 'string' && Object.hasOwn(MINESWEEPER_LEVELS, m.level)) return { t: 'new', level: m.level as MinesweeperLevel };
  if ((m.t === 'open' || m.t === 'flag' || m.t === 'chord') && count(m.index)) return { t: m.t, index: m.index };
  if (m.t === 'chat') return parseChat(m);
  if (m.t === 'cursor' && m.at === null) return { t: 'cursor', at: null };
  if (m.t === 'cursor' && Array.isArray(m.at) && m.at.length === 2 && within(m.at[0]) && within(m.at[1])) return { t: 'cursor', at: [m.at[0], m.at[1]] };
  return null;
}
