import { z } from 'zod';
import { isAdmin } from '../../config.js';
import { ApiError } from '../lib/errors.js';
import { verifySession } from '../auth/login.js';
import { verifyToken, verifyWatchToken } from '../auth/token.js';
import { parse } from '../lib/validate.js';
/**
 * A logged-in member ("Authorization: Bearer <session>"), or, where `link` allows it, a game page with its
 * link's token ("Authorization: Game <token>"): a link to play, or ('watch') to watch too.
 */
export const signedIn = (deps, link = null) => (req, res, next) => {
    const gameToken = /^Game (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (gameToken && link) {
        const viewer = verifyToken(gameToken) ?? (link === 'watch' ? (verifyWatchToken(gameToken)?.viewer ?? null) : null);
        if (!viewer || !deps.guild(viewer.guildId))
            throw new ApiError('not_logged_in');
        res.locals.link = viewer;
        res.locals.session = { userId: viewer.userId, name: viewer.name, avatar: null, guildIds: [viewer.guildId] };
        return next();
    }
    const secret = deps.config.clientSecret;
    if (!secret)
        throw new ApiError('no_login');
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    const session = bearer ? verifySession(bearer, secret) : null;
    if (!session)
        throw new ApiError('not_logged_in');
    res.locals.session = session;
    next();
};
/** Whether the asking member is (still) in `guildId`, with the bot: their name there, or a not_member. */
async function nameIn(deps, session, guildId) {
    if (!session.guildIds.includes(guildId) || !deps.guild(guildId))
        throw new ApiError('not_member');
    const name = await deps.memberName(guildId, session.userId);
    if (name === null)
        throw new ApiError('not_member');
    return name;
}
const Guild = z.object({ guild: z.string() });
/** After signedIn: the server they're asking about, which they must still be in. The link's own, or in the query (GET) or the body (POST). */
export const member = (deps) => async (req, res, next) => {
    const { session, link } = res.locals;
    const guildId = link?.guildId ?? parse(Guild, req.method === 'POST' ? req.body : req.query).guild;
    res.locals.name = await nameIn(deps, session, guildId);
    res.locals.guildId = guildId;
    next();
};
/**
 * After signedIn, for who's online and the leaderboard: a link asks about its own server (as the name it
 * carries); a logged-in member about the one in the query, which they must still be in.
 */
export const liveMember = (deps) => async (req, res, next) => {
    const { session, link } = res.locals;
    if (link) {
        res.locals.guildId = link.guildId;
        res.locals.name = link.name;
        return next();
    }
    const guildId = typeof req.query.guild === 'string' ? req.query.guild : '';
    res.locals.name = await nameIn(deps, session, guildId);
    res.locals.guildId = guildId;
    next();
};
/** After signedIn (logged in, not with a game link): the bot admin only (the site's admin page), anyone else a not_admin. */
export const admin = (_req, res, next) => {
    if (res.locals.link || !isAdmin(res.locals.session.userId))
        throw new ApiError('not_admin');
    next();
};
//# sourceMappingURL=auth.js.map