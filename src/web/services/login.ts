import { MINE_WEB } from '../../constants/index.js';
import type { ApiDeps } from '../api.js';
import { GAMES, gameLink, type Game } from '../config.js';
import { ApiError } from '../lib/errors.js';
import { authorizeUrl, avatarUrl, exchangeCode, guildIconUrl, signSession, type Session } from '../auth/login.js';
import { signToken } from '../auth/token.js';

/* Logging in on the site with Discord (login.ts), who is logged in, and links to play. */

/** Who is logged in, and where they can play. */
export interface Me {
  user: { id: string; name: string; avatar: string };
  servers: { id: string; name: string; icon: string | null; balance: number }[];
  games: Game[];
}

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
    return { user: { id: session.userId, name: session.name, avatar: avatarUrl(session.userId, session.avatar) }, servers, games: Object.keys(GAMES) as Game[] };
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
    async logIn(code: string): Promise<{ session: string; me: Me }> {
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
  };
}
