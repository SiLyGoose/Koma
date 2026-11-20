import { REACTIONS } from '../../../protocol/reactions.js';
export * from '../../../protocol/potato.js';
/* The page's messages as the bot reads them: what each says is ../../../protocol/potato.ts (the site keeps a copy). */
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
    if (m.t === 'join')
        return { t: 'join' };
    // (Pass to a player picked: their id. One that isn't playing is tossed at random, as a Pass with none.)
    if (m.t === 'pass')
        return m.to === undefined ? { t: 'pass' } : typeof m.to === 'string' && /^[\w-]{1,32}$/.test(m.to) ? { t: 'pass', to: m.to } : null;
    if (m.t === 'react' && typeof m.emoji === 'number' && Number.isSafeInteger(m.emoji) && m.emoji >= 0 && m.emoji < REACTIONS.length)
        return { t: 'react', emoji: m.emoji };
    return null;
}
//# sourceMappingURL=protocol.js.map