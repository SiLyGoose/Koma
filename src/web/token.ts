import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/*
 * The token in a "play in the browser" link: who it lets play (a member of one server), until
 * when, signed so it can't be made up or changed. Whoever has the link can start runs with that
 * member's points until it runs out, which is why the bot only ever hands it to them privately.
 * The key is new every time the bot starts, so a restart makes every old link stop working.
 */

const KEY = randomBytes(32);

/** Who a link lets play. `name` is only for showing on the page. */
export interface Player {
  guildId: string;
  userId: string;
  name: string;
}

const sign = (body: string, key: Buffer): string => createHmac('sha256', key).update(body).digest('base64url');

/** A token for `player`, good until `ttlMs` from `now`. */
export function signToken(player: Player, ttlMs: number, now = Date.now(), key: Buffer = KEY): string {
  const body = Buffer.from(JSON.stringify({ g: player.guildId, u: player.userId, n: player.name, e: now + ttlMs })).toString('base64url');
  return `${body}.${sign(body, key)}`;
}

/** Who a token lets play, or null when it is made up, changed or too old. */
export function verifyToken(token: string, now = Date.now(), key: Buffer = KEY): Player | null {
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) return null;
  const given = Buffer.from(signature);
  const wanted = Buffer.from(sign(body, key));
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>;
    const { g, u, n, e } = data;
    if (typeof g !== 'string' || typeof u !== 'string' || typeof n !== 'string' || typeof e !== 'number') return null;
    if (e < now) return null;
    return { guildId: g, userId: u, name: n };
  } catch {
    return null;
  }
}

/** One key per member per server, for looking up what they are playing. */
export const playerKey = (player: Pick<Player, 'guildId' | 'userId'>): string => `${player.guildId}:${player.userId}`;
