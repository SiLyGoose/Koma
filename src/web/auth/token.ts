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

const KEY = ((): Buffer => {
  const secret = optionalEnv('DS_TOKEN');
  return secret ? createHash('sha256').update(`koma-game-links:${secret}`).digest() : randomBytes(32);
})();

/** Who a link lets play. `name` is only for showing on the page. */
export interface Player {
  guildId: string;
  userId: string;
  name: string;
}

const sign = (body: string, key: Buffer): string => createHmac('sha256', key).update(body).digest('base64url');

/** `data` (with `e`, when it runs out, in ms) as a signed token. Also used for the site's logins (login.ts). */
export function signData(data: Record<string, unknown> & { e: number }, key: Buffer): string {
  const body = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${body}.${sign(body, key)}`;
}

/** What a token made by signData holds, or null when it is made up, changed or too old. */
export function verifyData(token: string, key: Buffer, now = Date.now()): Record<string, unknown> | null {
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) return null;
  const given = Buffer.from(signature);
  const wanted = Buffer.from(sign(body, key));
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as unknown;
    if (typeof data !== 'object' || data === null) return null;
    const { e } = data as Record<string, unknown>;
    if (typeof e !== 'number' || e < now) return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** A token for `player`, good until `ttlMs` from `now`. */
export function signToken(player: Player, ttlMs: number, now = Date.now(), key: Buffer = KEY): string {
  return signData({ g: player.guildId, u: player.userId, n: player.name, e: now + ttlMs }, key);
}

/** Who a token lets play, or null when it is made up, changed or too old (or a watch token, which only lets them watch). */
export function verifyToken(token: string, now = Date.now(), key: Buffer = KEY): Player | null {
  const data = verifyData(token, key, now);
  if (!data || data.k !== undefined) return null;
  const { g, u, n } = data;
  if (typeof g !== 'string' || typeof u !== 'string' || typeof n !== 'string') return null;
  return { guildId: g, userId: u, name: n };
}

/** A watch link's token: a member (`viewer`) watching another (`target`) play, in one server. It can't be used to play. */
export interface Watch {
  viewer: Player;
  targetId: string;
}

export function signWatchToken(watch: Watch, ttlMs: number, now = Date.now(), key: Buffer = KEY): string {
  const { viewer } = watch;
  return signData({ k: 'w', g: viewer.guildId, u: viewer.userId, n: viewer.name, t: watch.targetId, e: now + ttlMs }, key);
}

/** Who a watch token lets watch whom, or null when it isn't one (or is made up, changed or too old). */
export function verifyWatchToken(token: string, now = Date.now(), key: Buffer = KEY): Watch | null {
  const data = verifyData(token, key, now);
  if (!data || data.k !== 'w') return null;
  const { g, u, n, t } = data;
  if (typeof g !== 'string' || typeof u !== 'string' || typeof n !== 'string' || typeof t !== 'string') return null;
  return { viewer: { guildId: g, userId: u, name: n }, targetId: t };
}

/**
 * A link's refresh token: what an open game page trades for a new token for its link as that one runs out (POST
 * /api/link/refresh), so a page left open for hours (its player away, the computer asleep) carries on rather than its link
 * running out. It lasts far longer than a link (MINE_WEB.refreshTtlMs), and each trade gives a new one with it. Whose
 * link it is, and (`target`) whom a watch link watches; it can't be used to play or watch by itself (verifyToken and
 * verifyWatchToken take only their own).
 */
export interface Refresh {
  player: Player;
  /** A watch link's: whom it watches (null: a link to play). */
  target: string | null;
}

export function signRefreshToken(refresh: Refresh, ttlMs: number, now = Date.now(), key: Buffer = KEY): string {
  const { player, target } = refresh;
  return signData({ k: 'r', g: player.guildId, u: player.userId, n: player.name, ...(target !== null && { t: target }), e: now + ttlMs }, key);
}

/** Whose link a refresh token renews, or null when it isn't one (or is made up, changed or too old). */
export function verifyRefreshToken(token: string, now = Date.now(), key: Buffer = KEY): Refresh | null {
  const data = verifyData(token, key, now);
  if (!data || data.k !== 'r') return null;
  const { g, u, n, t } = data;
  if (typeof g !== 'string' || typeof u !== 'string' || typeof n !== 'string' || (t !== undefined && typeof t !== 'string')) return null;
  return { player: { guildId: g, userId: u, name: n }, target: t ?? null };
}

/** One key per member per server, for looking up what they are playing. */
export const playerKey = (player: Pick<Player, 'guildId' | 'userId'>): string => `${player.guildId}:${player.userId}`;
