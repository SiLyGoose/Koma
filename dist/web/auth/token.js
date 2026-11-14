import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { optionalEnv } from '../../env.js';
/*
 * The token in a link into a game (Mines or Pinecraft): who it lets play (a member of one server),
 * until when, signed so it can't be made up or changed. Whoever has the link can play with that
 * member's points until it runs out, which is why the site only ever hands it to them.
 *
 * The key is made from the bot's token (DS_TOKEN), so it stays the same when the bot restarts (a
 * deploy, or every code change under `yarn dev`) and open pages carry on with their links. Without
 * a DS_TOKEN (the tests) it is new every start.
 */
const KEY = (() => {
    const secret = optionalEnv('DS_TOKEN');
    return secret ? createHash('sha256').update(`koma-game-links:${secret}`).digest() : randomBytes(32);
})();
const sign = (body, key) => createHmac('sha256', key).update(body).digest('base64url');
/** `data` (with `e`, when it runs out, in ms) as a signed token. Also used for the site's logins (login.ts). */
export function signData(data, key) {
    const body = Buffer.from(JSON.stringify(data)).toString('base64url');
    return `${body}.${sign(body, key)}`;
}
/** What a token made by signData holds, or null when it is made up, changed or too old. */
export function verifyData(token, key, now = Date.now()) {
    const [body, signature, extra] = token.split('.');
    if (!body || !signature || extra !== undefined)
        return null;
    const given = Buffer.from(signature);
    const wanted = Buffer.from(sign(body, key));
    if (given.length !== wanted.length || !timingSafeEqual(given, wanted))
        return null;
    try {
        const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (typeof data !== 'object' || data === null)
            return null;
        const { e } = data;
        if (typeof e !== 'number' || e < now)
            return null;
        return data;
    }
    catch {
        return null;
    }
}
/** A token for `player`, good until `ttlMs` from `now`. */
export function signToken(player, ttlMs, now = Date.now(), key = KEY) {
    return signData({ g: player.guildId, u: player.userId, n: player.name, e: now + ttlMs }, key);
}
/** Who a token lets play, or null when it is made up, changed or too old (or a watch token, which only lets them watch). */
export function verifyToken(token, now = Date.now(), key = KEY) {
    const data = verifyData(token, key, now);
    if (!data || data.k !== undefined)
        return null;
    const { g, u, n } = data;
    if (typeof g !== 'string' || typeof u !== 'string' || typeof n !== 'string')
        return null;
    return { guildId: g, userId: u, name: n };
}
export function signWatchToken(watch, ttlMs, now = Date.now(), key = KEY) {
    const { viewer } = watch;
    return signData({ k: 'w', g: viewer.guildId, u: viewer.userId, n: viewer.name, t: watch.targetId, e: now + ttlMs }, key);
}
/** Who a watch token lets watch whom, or null when it isn't one (or is made up, changed or too old). */
export function verifyWatchToken(token, now = Date.now(), key = KEY) {
    const data = verifyData(token, key, now);
    if (!data || data.k !== 'w')
        return null;
    const { g, u, n, t } = data;
    if (typeof g !== 'string' || typeof u !== 'string' || typeof n !== 'string' || typeof t !== 'string')
        return null;
    return { viewer: { guildId: g, userId: u, name: n }, targetId: t };
}
export function signRefreshToken(refresh, ttlMs, now = Date.now(), key = KEY) {
    const { player, target } = refresh;
    return signData({ k: 'r', g: player.guildId, u: player.userId, n: player.name, ...(target !== null && { t: target }), e: now + ttlMs }, key);
}
/** Whose link a refresh token renews, or null when it isn't one (or is made up, changed or too old). */
export function verifyRefreshToken(token, now = Date.now(), key = KEY) {
    const data = verifyData(token, key, now);
    if (!data || data.k !== 'r')
        return null;
    const { g, u, n, t } = data;
    if (typeof g !== 'string' || typeof u !== 'string' || typeof n !== 'string' || (t !== undefined && typeof t !== 'string'))
        return null;
    return { player: { guildId: g, userId: u, name: n }, target: t ?? null };
}
/** One key per member per server, for looking up what they are playing. */
export const playerKey = (player) => `${player.guildId}:${player.userId}`;
//# sourceMappingURL=token.js.map