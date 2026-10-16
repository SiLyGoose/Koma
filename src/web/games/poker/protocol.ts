import type { ClientMessage, PokerMove } from '../../../protocol/poker.js';
import { parseChat } from '../chat.js';

export * from '../../../protocol/poker.js';

/* The page's messages as the bot reads them: what each says is ../../../protocol/poker.ts (the site keeps a copy). */

const MOVES: readonly PokerMove[] = ['fold', 'check', 'call', 'raise', 'allIn'];
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
  if (m.t === 'sit' && count(m.chips) && (m.seat === undefined || count(m.seat))) return { t: 'sit', chips: m.chips, ...(m.seat === undefined ? {} : { seat: m.seat }) };
  if (m.t === 'stand') return { t: 'stand' };
  if (m.t === 'act' && MOVES.includes(m.move as PokerMove) && (m.amount === undefined || count(m.amount))) {
    return { t: 'act', move: m.move as PokerMove, ...(m.amount === undefined ? {} : { amount: m.amount }) };
  }
  if (m.t === 'bot' && m.add === true) return { t: 'bot', add: true };
  if (m.t === 'bot' && m.add === false && count(m.seat)) return { t: 'bot', add: false, seat: m.seat };
  if (m.t === 'chat') return parseChat(m);
  return null;
}
