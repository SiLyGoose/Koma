import type { ClientMessage, SpotBets } from '../../../protocol/table.js';
import { parseChat } from '../chat.js';

export * from '../../../protocol/table.js';

/* The page's messages as the bot reads them: what each says is ../../../protocol/table.ts (the site keeps a copy). */

/** Reads a message from the page, its chips by `parseBets`. Null when it isn't a valid one. */
export function parseTableMessage<S extends string>(text: string, parseBets: (data: unknown) => SpotBets<S> | null): ClientMessage<S> | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  if ((m.t === 'hello' || m.t === 'watch') && typeof m.token === 'string' && m.token.length <= 512) return { t: m.t, token: m.token };
  if (m.t === 'bets' && typeof m.seq === 'number' && Number.isSafeInteger(m.seq) && m.seq > 0) {
    const bets = parseBets(m.bets);
    return bets ? { t: 'bets', bets, seq: m.seq } : null;
  }
  if (m.t === 'deal' && typeof m.ready === 'boolean') return { t: 'deal', ready: m.ready };
  if (m.t === 'chat') return parseChat(m);
  return null;
}
