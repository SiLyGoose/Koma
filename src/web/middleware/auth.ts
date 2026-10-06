import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { ApiDeps } from '../api.js';
import { ApiError } from '../errors.js';
import { verifySession, type Session } from '../login.js';
import { verifyToken, verifyWatchToken, type Player } from '../token.js';
import { parse } from '../validate.js';

/* Who is asking, and about which server. What they find is kept in res.locals for the controllers. */

declare global {
  namespace Express {
    interface Locals {
      /** Who is asking (signedIn): a logged-in member, or a game link's member as if logged in to its server only. */
      session: Session;
      /** The game link they're asking with, if they are (signedIn). Its server is the only one it answers about. */
      link?: Player;
      /** The server they're asking about, and their name in it (member, liveMember). */
      guildId: string;
      name: string;
    }
  }
}

/**
 * A logged-in member ("Authorization: Bearer <session>"), or, where `link` allows it, a game page with its
 * link's token ("Authorization: Game <token>"): a link to play, or ('watch') to watch too.
 */
export const signedIn =
  (deps: ApiDeps, link: 'play' | 'watch' | null = null): RequestHandler =>
  (req, res, next) => {
    const gameToken = /^Game (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (gameToken && link) {
      const viewer = verifyToken(gameToken) ?? (link === 'watch' ? (verifyWatchToken(gameToken)?.viewer ?? null) : null);
      if (!viewer || !deps.guild(viewer.guildId)) throw new ApiError('not_logged_in');
      res.locals.link = viewer;
      res.locals.session = { userId: viewer.userId, name: viewer.name, avatar: null, guildIds: [viewer.guildId] };
      return next();
    }
    const secret = deps.config.clientSecret;
    if (!secret) throw new ApiError('no_login');
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    const session = bearer ? verifySession(bearer, secret) : null;
    if (!session) throw new ApiError('not_logged_in');
    res.locals.session = session;
    next();
  };

/** Whether the asking member is (still) in `guildId`, with the bot: their name there, or a not_member. */
async function nameIn(deps: ApiDeps, session: Session, guildId: string): Promise<string> {
  if (!session.guildIds.includes(guildId) || !deps.guild(guildId)) throw new ApiError('not_member');
  const name = await deps.memberName(guildId, session.userId);
  if (name === null) throw new ApiError('not_member');
  return name;
}

const Guild = z.object({ guild: z.string() });

/** After signedIn: the server they're asking about, which they must still be in. The link's own, or in the query (GET) or the body (POST). */
export const member =
  (deps: ApiDeps): RequestHandler =>
  async (req, res, next) => {
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
export const liveMember =
  (deps: ApiDeps): RequestHandler =>
  async (req, res, next) => {
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
