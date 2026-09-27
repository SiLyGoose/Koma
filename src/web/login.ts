import { createHash } from 'node:crypto';
import { signData, verifyData } from './token.js';

/*
 * Logging in on the site with Discord (OAuth2, scopes identify and guilds). The site sends the
 * member to Discord, Discord sends them back to the site with a code, and the site hands the code
 * to the bot (api.ts), which trades it for who they are and which servers they are in. They get a
 * session: a signed token saying who they are and which of the bot's servers they were in. It is
 * signed with a key made from the client secret, so it keeps working when the bot restarts.
 */

/** How long a login lasts. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60_000;

const DISCORD_API = 'https://discord.com/api/v10';

/** Who is logged in. */
export interface Session {
  userId: string;
  name: string;
  /** Their avatar's hash on Discord, if they have one. */
  avatar: string | null;
  /** The bot's servers they were in when they logged in. */
  guildIds: string[];
}

const keyFrom = (clientSecret: string): Buffer => createHash('sha256').update(`koma-site-login:${clientSecret}`).digest();

export function signSession(session: Session, clientSecret: string, now = Date.now()): string {
  return signData({ u: session.userId, n: session.name, a: session.avatar, g: session.guildIds, e: now + SESSION_TTL_MS }, keyFrom(clientSecret));
}

/** Who a session token is for, or null when it is made up, changed or too old. */
export function verifySession(token: string, clientSecret: string, now = Date.now()): Session | null {
  const data = verifyData(token, keyFrom(clientSecret), now);
  if (!data) return null;
  const { u, n, a, g } = data;
  if (typeof u !== 'string' || typeof n !== 'string' || (a !== null && typeof a !== 'string')) return null;
  if (!Array.isArray(g) || !g.every((id) => typeof id === 'string')) return null;
  return { userId: u, name: n, avatar: a, guildIds: g as string[] };
}

/** Where the site sends a member to log in. Discord sends them back to `redirectUri` with a code and `state`. */
export const authorizeUrl = (clientId: string, redirectUri: string, state: string): string =>
  `https://discord.com/oauth2/authorize?${new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri, scope: 'identify guilds', state })}`;

/** Who logged in, and the ids of every server they are in. */
export interface DiscordLogin {
  userId: string;
  name: string;
  avatar: string | null;
  guildIds: string[];
}

/** Trades the code Discord gave the site for who logged in. Throws when Discord says no. */
export async function exchangeCode(code: string, clientId: string, clientSecret: string, redirectUri: string): Promise<DiscordLogin> {
  const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  });
  if (!tokenRes.ok) throw new Error(`Discord would not trade the login code (${tokenRes.status})`);
  const { access_token: accessToken } = (await tokenRes.json()) as { access_token?: string };
  if (!accessToken) throw new Error('Discord sent no access token');

  const get = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${DISCORD_API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`Discord would not say ${path} (${res.status})`);
    return (await res.json()) as T;
  };
  const [user, guilds] = await Promise.all([
    get<{ id: string; username: string; global_name?: string | null; avatar?: string | null }>('/users/@me'),
    get<{ id: string }[]>('/users/@me/guilds'),
  ]);
  return { userId: user.id, name: user.global_name || user.username, avatar: user.avatar ?? null, guildIds: guilds.map((g) => g.id) };
}

/** A member's avatar picture: theirs, or one of Discord's default ones. */
export const avatarUrl = (userId: string, avatar: string | null): string =>
  avatar
    ? `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(userId) >> 22n) % 6n)}.png`;

/** A server's icon, if it has one. */
export const guildIconUrl = (guildId: string, icon: string | null): string | null => (icon ? `https://cdn.discordapp.com/icons/${guildId}/${icon}.png?size=64` : null);
