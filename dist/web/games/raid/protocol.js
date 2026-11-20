export * from '../../../protocol/raid.js';
/* The page's messages as the bot reads them: what each says is ../../../protocol/raid.ts (the site keeps a copy). */
const ACTIONS = ['attack', 'guard', 'heal', 'support'];
/** A message from a page, or null if it isn't one of the above. */
export function parseClientMessage(text) {
    let value;
    try {
        value = JSON.parse(text);
    }
    catch {
        return null;
    }
    if (typeof value !== 'object' || value === null)
        return null;
    const m = value;
    switch (m.t) {
        case 'hello':
            return typeof m.token === 'string' ? { t: 'hello', token: m.token } : null;
        case 'start':
            if (m.level === undefined)
                return { t: 'start' };
            return typeof m.level === 'number' && Number.isInteger(m.level) && m.level >= 1 && m.level <= 100 ? { t: 'start', level: m.level } : null;
        case 'join':
        case 'leave':
        case 'begin':
        case 'disband':
            return { t: m.t };
        case 'difficulty':
            return typeof m.level === 'number' && Number.isInteger(m.level) && m.level >= 1 && m.level <= 100 ? { t: 'difficulty', level: m.level } : null;
        case 'act': {
            if (typeof m.action !== 'string' || !ACTIONS.includes(m.action))
                return null;
            if (m.target !== undefined && (typeof m.target !== 'string' || !/^\d{1,20}$/.test(m.target)))
                return null;
            if (m.skill !== undefined && m.skill !== 'ward')
                return null;
            return { t: 'act', action: m.action, ...(m.target === undefined ? {} : { target: m.target }), ...(m.skill === undefined ? {} : { skill: 'ward' }) };
        }
        default:
            return null;
    }
}
//# sourceMappingURL=protocol.js.map