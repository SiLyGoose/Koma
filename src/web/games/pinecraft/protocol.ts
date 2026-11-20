import type { ClientMessage, Direction } from '../../../protocol/pinecraft.js';

export * from '../../../protocol/pinecraft.js';

/* The page's messages as the bot reads them: what each says is ../../../protocol/pinecraft.ts (the site keeps a copy). */

const DIRECTIONS = new Set(['up', 'down', 'left', 'right']);

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
  if (m.t === 'map') return { t: 'map' };
  if (m.t === 'mine' && typeof m.dir === 'string' && DIRECTIONS.has(m.dir)) return { t: 'mine', dir: m.dir as Direction };
  if (m.t === 'move' && typeof m.seq === 'number' && Number.isSafeInteger(m.seq) && m.seq > 0 && typeof m.dir === 'string' && DIRECTIONS.has(m.dir)) {
    return { t: 'move', dir: m.dir as Direction, seq: m.seq };
  }
  return null;
}
