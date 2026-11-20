import type { ClientMessage } from '../../../protocol/potato.js';

export * from '../../../protocol/potato.js';

/* The page's messages as the bot reads them: what each says is ../../../protocol/potato.ts (the site keeps a copy). */

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
  if ((m.t === 'hello' || m.t === 'watch') && typeof m.token === 'string' && m.token.length <= 512) return { t: m.t, token: m.token };
  if (m.t === 'join' || m.t === 'pass') return { t: m.t };
  return null;
}
