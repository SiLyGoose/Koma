export * from '../../../protocol/pinecraft.js';
/* The page's messages as the bot reads them: what each says is ../../../protocol/pinecraft.ts (the site keeps a copy). */
const DIRECTIONS = new Set(['up', 'down', 'left', 'right']);
/** Reads a message from the page. Null when it isn't a valid one. */
export function parseClientMessage(text) {
    let data;
    try {
        data = JSON.parse(text);
    }
    catch {
        return null;
    }
    if (typeof data !== 'object' || data === null)
        return null;
    const m = data;
    if ((m.t === 'hello' || m.t === 'watch') && typeof m.token === 'string' && m.token.length <= 512)
        return { t: m.t, token: m.token };
    if (m.t === 'map')
        return { t: 'map' };
    if (m.t === 'mine' && typeof m.dir === 'string' && DIRECTIONS.has(m.dir))
        return { t: 'mine', dir: m.dir };
    if (m.t === 'move' && typeof m.seq === 'number' && Number.isSafeInteger(m.seq) && m.seq > 0 && typeof m.dir === 'string' && DIRECTIONS.has(m.dir)) {
        return { t: 'move', dir: m.dir, seq: m.seq };
    }
    return null;
}
//# sourceMappingURL=protocol.js.map