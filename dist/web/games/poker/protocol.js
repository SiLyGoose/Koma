import { parseChat } from '../chat.js';
export * from '../../../protocol/poker.js';
/* The page's messages as the bot reads them: what each says is ../../../protocol/poker.ts (the site keeps a copy). */
const MOVES = ['fold', 'check', 'call', 'raise', 'allIn'];
const count = (n) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
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
    if (m.t === 'hello' && typeof m.token === 'string' && m.token.length <= 512)
        return { t: 'hello', token: m.token };
    if (m.t === 'tables')
        return { t: 'tables' };
    if (m.t === 'join' && (m.table === 'new' || (count(m.table) && m.table >= 1)))
        return { t: 'join', table: m.table };
    if (m.t === 'leave')
        return { t: 'leave' };
    if (m.t === 'sit' && count(m.chips) && (m.seat === undefined || count(m.seat)))
        return { t: 'sit', chips: m.chips, ...(m.seat === undefined ? {} : { seat: m.seat }) };
    if (m.t === 'stand')
        return { t: 'stand' };
    if (m.t === 'act' && MOVES.includes(m.move) && (m.amount === undefined || count(m.amount))) {
        return { t: 'act', move: m.move, ...(m.amount === undefined ? {} : { amount: m.amount }) };
    }
    if (m.t === 'bot' && m.add === true)
        return { t: 'bot', add: true };
    if (m.t === 'bot' && m.add === false && count(m.seat))
        return { t: 'bot', add: false, seat: m.seat };
    if (m.t === 'chat')
        return parseChat(m);
    return null;
}
//# sourceMappingURL=protocol.js.map