import type { ClientMessage } from '../../../protocol/codedle.js';

export * from '../../../protocol/codedle.js';

/* The page's messages as the bot reads them: what each says is ../../../protocol/codedle.ts (the site keeps a copy). */

/** Reads a message from the page. Null when it isn't a valid one (a guess's digits are checked by the game: a wrong one is answered, not hung up on). */
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
  if (m.t === 'guess' && typeof m.guess === 'string' && m.guess.length <= 32 && typeof m.seq === 'number' && Number.isSafeInteger(m.seq) && m.seq > 0) {
    return { t: 'guess', guess: m.guess, seq: m.seq };
  }
  return null;
}
