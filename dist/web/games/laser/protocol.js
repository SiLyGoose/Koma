import { REACTIONS } from '../../../protocol/reactions.js';
export * from '../../../protocol/laser.js';
/* The page's messages as the bot reads them: what each says is ../../../protocol/laser.ts (the site keeps a copy). */
const count = (value, below) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value < below;
/** Reads a message from the page. Null when it isn't a valid one (a press of a round or slot that isn't the game's is answered, not hung up on). */
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
    if (m.t === 'press' && count(m.round, 1_000) && (m.phase === 'wait' || m.phase === 'go') && count(m.slot, 100))
        return { t: 'press', round: m.round, phase: m.phase, slot: m.slot };
    if (m.t === 'react' && count(m.emoji, REACTIONS.length))
        return { t: 'react', emoji: m.emoji };
    return null;
}
//# sourceMappingURL=protocol.js.map