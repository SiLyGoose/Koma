import { MINE_TILES } from '../../../constants/index.js';
import type { ClientMessage } from '../../../protocol/mines.js';

export * from '../../../protocol/mines.js';

/* The page's messages as the bot reads them: what each says is ../../../protocol/mines.ts (the site keeps a copy). */

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
  const seqOk = typeof m.seq === 'number' && Number.isSafeInteger(m.seq) && m.seq > 0;
  const seq = m.seq as number;
  if ((m.t === 'hello' || m.t === 'watch') && typeof m.token === 'string' && m.token.length <= 512) return { t: m.t, token: m.token };
  if (m.t === 'start' && seqOk && Number.isSafeInteger(m.mines) && (m.bet === 'all' || (typeof m.bet === 'number' && Number.isSafeInteger(m.bet) && m.bet > 0))) {
    return { t: 'start', bet: m.bet as number | 'all', mines: m.mines as number, seq };
  }
  if (m.t === 'pick' && seqOk && (m.index === 'random' || (typeof m.index === 'number' && Number.isInteger(m.index) && m.index >= 0 && m.index < MINE_TILES))) {
    return { t: 'pick', index: m.index as number | 'random', seq };
  }
  if (m.t === 'cashout' && seqOk) return { t: 'cashout', seq };
  return null;
}
