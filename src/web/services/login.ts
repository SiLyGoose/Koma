import { isAdmin } from '../../config.js';
import { MINE_WEB } from '../../constants/index.js';
import type { ApiDeps } from '../api.js';
import { GAMES, gameLink, type Game } from '../config.js';
import { ApiError } from '../lib/errors.js';
import { authorizeUrl, avatarUrl, exchangeCode, guildIconUrl, signSession, type Session } from '../auth/login.js';
import { signRefreshToken, signToken, signWatchToken, verifyRefreshToken, verifyToken, verifyWatchToken, type Refresh } from '../auth/token.js';
import type { LinkRefresh, LogIn, Me } from '../../protocol/site.js';

export type { Me };

/* Logging in on the site with Discord (login.ts), who is logged in, and links to play. */

export type LoginService = ReturnType<typeof loginService>;

export function loginService(deps: ApiDeps) {
  const { config } = deps;
  /** Where Discord sends members back to after logging in: the site's front page. */
  const redirectUri = `${config.siteUrl}/`;

  async function me(session: Session): Promise<Me> {
    const servers: Me['servers'] = [];
    for (const id of session.guildIds) {
      const guild = deps.guild(id);
      if (!guild) continue;
      servers.push({ id, name: guild.name, icon: guildIconUrl(id, guild.icon), balance: await deps.balance(id, session.userId) });
    }
    return { user: { id: session.userId, name: session.name, avatar: avatarUrl(session.userId, session.avatar) }, servers, games: Object.keys(GAMES) as Game[], admin: isAdmin(session.userId) };
  }

  return {
    me,

    /** Where to send the browser to log in with Discord. */
    authorizeUrl(state: string): string {
      const clientId = deps.clientId();
      if (!config.clientSecret || !clientId) throw new ApiError('no_login');
      return authorizeUrl(clientId, redirectUri, state);
    },

    /** Trades the code Discord gave the site for a session, in the bot's servers only. */
    async logIn(code: string): Promise<LogIn> {
      const secret = config.clientSecret;
      if (!secret) throw new ApiError('no_login');
      const clientId = deps.clientId();
      if (!clientId) throw new ApiError('bad_request');
      let login;
      try {
        login = await (deps.login ?? exchangeCode)(code, clientId, secret, redirectUri);
      } catch (err) {
        console.error('A login on the site failed:', err);
        throw new ApiError('discord_failed');
      }
      const session: Session = { userId: login.userId, name: login.name, avatar: login.avatar, guildIds: login.guildIds.filter((id) => deps.guild(id) !== null) };
      return { session: signSession(session, secret), me: await me(session) };
    },

    /** A link to play `game` in a server they're (still) in. */
    async playLink(session: Session, guildId: string, game: Game): Promise<string> {
      if (!session.guildIds.includes(guildId) || !deps.guild(guildId)) throw new ApiError('not_member');
      const name = await deps.memberName(guildId, session.userId);
      if (name === null) throw new ApiError('not_member');
      const token = signToken({ guildId, userId: session.userId, name }, MINE_WEB.linkTtlMs);
      return gameLink(config, game, token);
    },

    /**
     * An open game page's link renewed, for a link's token still good (the page just opened: its first refresh token
     * with it) or its refresh token: a new token for it, and a new refresh token. Only while the member is still in its
     * server (their name there as it is now).
     */
    async refreshLink(given: { token?: string; refresh?: string }, now = Date.now()): Promise<LinkRefresh> {
      const watch = given.token ? verifyWatchToken(given.token, now) : null;
      const play = given.token && !watch ? verifyToken(given.token, now) : null;
      const held: Refresh | null = given.refresh ? verifyRefreshToken(given.refresh, now) : play ? { player: play, target: null } : watch ? { player: watch.viewer, target: watch.targetId } : null;
      if (!held) throw new ApiError('not_logged_in');
      const { guildId, userId } = held.player;
      const name = deps.guild(guildId) ? await deps.memberName(guildId, userId) : null;
      if (name === null) throw new ApiError('not_member');
      const player = { guildId, userId, name };
      return {
        token: held.target === null ? signToken(player, MINE_WEB.linkTtlMs, now) : signWatchToken({ viewer: player, targetId: held.target }, MINE_WEB.linkTtlMs, now),
        refresh: signRefreshToken({ player, target: held.target }, MINE_WEB.refreshTtlMs, now),
        lastsMs: MINE_WEB.linkTtlMs,
      };
    },
  };
}
