import type { IncomingMessage, ServerResponse } from 'node:http';
import { MINE_WEB } from '../constants/index.js';
import { SLOTS, type Slot } from '../types.js';
import { GAMES, gameLink, watchLink, type Game, type WebConfig } from './config.js';
import { pinecraftLeaderboard, type PinecraftLeaderboard, type PinecraftStat } from '../services/pinecraft.js';
import { LOADOUT_NUMBERS } from '../lib/game/items/loadouts.js';
import { databankView } from './databank.js';
import { gearStore, type ForgeBlock, type GearStore, type RefineBlock } from './gear.js';
import { hubSeen, isPlaying, online, type LiveGame } from './live.js';
import { authorizeUrl, avatarUrl, exchangeCode, guildIconUrl, signSession, verifySession, type Session } from './login.js';
import { signToken, signWatchToken, verifyToken, verifyWatchToken, type Player } from './token.js';

/*
 * What the site asks the bot over https, for members who log in on it with Discord (login.ts)
 * rather than opening a game from a link in Discord:
 *
 *   GET  /api/login?state=…   sends the browser to Discord to log in (Discord sends it back to the site)
 *   POST /api/login {code}    trades the code Discord gave the site for a session: { session, me }
 *   GET  /api/me              who is logged in, and the servers they can play in: Me
 *   POST /api/play {guild, game}   a link to play `game` in that server: { url }
 *   GET  /api/live?guild=…    who's on the site in that server, and what they're doing: Live
 *   POST /api/watch {guild, game, target}   a link to watch `target` play `game`: { url }
 *   GET  /api/pinecraft/leaderboard?guild=…&stat=dug|earned   the server's best miners: Leaderboard
 *   GET  /api/gear?guild=…    the member's gear in that server: GearView (gear.ts)
 *   POST /api/gear/equip {guild, copy}   puts on one of their copies: GearView
 *   POST /api/gear/unequip {guild, slot}   empties a slot: GearView
 *   POST /api/gear/unequip-all {guild}   empties every slot: GearView
 *   POST /api/gear/loadout {guild, loadout}   switches to loadout number `loadout`: GearView
 *   POST /api/gear/refine {guild, copy}   refines one of their copies a level: GearView
 *   POST /api/gear/forge {guild, copy}   forges one of their R5 copies into a masterwork with komaGems: GearView
 *   GET  /api/databank        every item and what it does at each level: Databank (databank.ts)
 *
 * /api/live, /api/watch and the leaderboard also take the token from a game page's own link, as
 * "Authorization: Game <token>" (the server is the link's). The front page's /api/live counts as
 * being on the site (live.ts).
 *
 * Everything but the first and the databank takes the session as "Authorization: Bearer <session>", and only answers
 * the site's own origin. Errors are { error } with a code the site knows.
 */

export interface ApiDeps {
  config: WebConfig;
  /** The bot's application id (the OAuth2 client id), once it has logged in to Discord. */
  clientId: () => string | null;
  /** One of the bot's servers, or null when it isn't in it. */
  guild: (guildId: string) => { name: string; icon: string | null } | null;
  /** A member's name in a server, or null when they aren't in it (any more). */
  memberName: (guildId: string, userId: string) => Promise<string | null>;
  balance: (guildId: string, userId: string) => Promise<number>;
  /** A member's avatar picture in a server, if the bot knows it. */
  avatar?: (guildId: string, userId: string) => string | null;
  /** Pinecraft's leaderboards (the database's, unless a test says otherwise). */
  leaderboard?: typeof pinecraftLeaderboard;
  /** Members' gear, for the gear page (the database's, unless a test says otherwise). */
  gear?: GearStore;
  login?: typeof exchangeCode;
}

/** A Pinecraft leaderboard (GET /api/pinecraft/leaderboard): the best miners by `stat`, and where the one asking stands. */
export interface Leaderboard {
  stat: PinecraftStat;
  rows: { rank: number; userId: string; name: string; avatar: string; value: number }[];
  you: { rank: number; value: number } | null;
}

/** Who's on the site in a server (GET /api/live). */
export interface Live {
  /** The one asking. */
  you: string;
  players: {
    userId: string;
    name: string;
    avatar: string;
    activity: 'hub' | LiveGame;
    status: string;
    watchers: number;
    since: number;
    /** Whether the one asking can watch them (they're in a game, and aren't the one asking). */
    watchable: boolean;
  }[];
}

/** Who is logged in, and where they can play. */
export interface Me {
  user: { id: string; name: string; avatar: string };
  servers: { id: string; name: string; icon: string | null; balance: number }[];
  games: Game[];
}

type ErrorCode = 'bad_request' | 'no_login' | 'not_logged_in' | 'not_member' | 'discord_failed' | 'not_found' | 'not_playing' | 'busy' | RefineBlock | ForgeBlock;
const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  no_login: 404,
  not_logged_in: 401,
  not_member: 403,
  discord_failed: 502,
  not_found: 404,
  not_playing: 409,
  busy: 409,
  maxed: 409,
  no_duplicate: 409,
  other_copy: 409,
  too_poor: 409,
  forged: 409,
  too_low: 409,
};

const MAX_BODY_BYTES = 4096;

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
const fail = (res: ServerResponse, code: ErrorCode): void => send(res, STATUS[code], { error: code });

function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        resolve(null);
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
        resolve(typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : null);
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

/** Where Discord sends members back to after logging in: the site's front page. */
const redirectUri = (config: WebConfig): string => `${config.siteUrl}/`;

async function meFor(session: Session, deps: ApiDeps): Promise<Me> {
  const servers: Me['servers'] = [];
  for (const id of session.guildIds) {
    const guild = deps.guild(id);
    if (!guild) continue;
    servers.push({ id, name: guild.name, icon: guildIconUrl(id, guild.icon), balance: await deps.balance(id, session.userId) });
  }
  return { user: { id: session.userId, name: session.name, avatar: avatarUrl(session.userId, session.avatar) }, servers, games: Object.keys(GAMES) as Game[] };
}

const LIVE_GAMES: readonly LiveGame[] = ['mines', 'pinecraft', 'baccarat', 'roulette'];
/** What a game page (with its link's token) or a logged-in member can ask about their server. */
const LIVE_PATHS = new Set(['/api/live', '/api/watch', '/api/pinecraft/leaderboard']);

/** GET /api/live and POST /api/watch, for `viewer` (in the server they're asking about). */
async function liveRoutes(req: IncomingMessage, res: ServerResponse, url: URL, deps: ApiDeps, viewer: Player): Promise<void> {
  const { guildId } = viewer;
  if (url.pathname === '/api/live' && req.method === 'GET') {
    const live: Live = {
      you: viewer.userId,
      players: online(guildId).map((p) => ({
        ...p,
        avatar: deps.avatar?.(guildId, p.userId) ?? avatarUrl(p.userId, null),
        watchable: p.activity !== 'hub' && p.userId !== viewer.userId,
      })),
    };
    return send(res, 200, live);
  }
  if (url.pathname === '/api/pinecraft/leaderboard' && req.method === 'GET') {
    const stat = url.searchParams.get('stat');
    if (stat !== 'dug' && stat !== 'earned') return fail(res, 'bad_request');
    const board: PinecraftLeaderboard = await (deps.leaderboard ?? pinecraftLeaderboard)(guildId, stat, viewer.userId);
    const rows = await Promise.all(
      board.top.map(async ({ userId, value }, i) => ({
        rank: i + 1,
        userId,
        name: (userId === viewer.userId ? viewer.name : await deps.memberName(guildId, userId)) ?? 'Someone who left',
        avatar: deps.avatar?.(guildId, userId) ?? avatarUrl(userId, null),
        value,
      })),
    );
    const leaderboard: Leaderboard = { stat, rows, you: board.you && { rank: board.you.rank, value: board.you.value } };
    return send(res, 200, leaderboard);
  }
  if (url.pathname === '/api/watch' && req.method === 'POST') {
    const body = await readJson(req);
    const game = body?.game;
    const target = body?.target;
    if (typeof game !== 'string' || !LIVE_GAMES.includes(game as LiveGame) || typeof target !== 'string' || target === viewer.userId) return fail(res, 'bad_request');
    if (!isPlaying(game as LiveGame, guildId, target)) return fail(res, 'not_playing');
    const token = signWatchToken({ viewer, targetId: target }, MINE_WEB.linkTtlMs);
    return send(res, 200, { url: watchLink(deps.config, game as Game, token) });
  }
  fail(res, 'not_found');
}

/** The gear page's routes, for a logged-in member: the server comes in the query (GET) or the body (POST). */
async function gearRoutes(req: IncomingMessage, res: ServerResponse, url: URL, deps: ApiDeps, session: Session): Promise<void> {
  const store = deps.gear ?? gearStore;
  const body = req.method === 'POST' ? await readJson(req) : null;
  const guildId = req.method === 'POST' ? body?.guild : url.searchParams.get('guild');
  if (typeof guildId !== 'string') return fail(res, 'bad_request');
  if (!session.guildIds.includes(guildId) || !deps.guild(guildId) || (await deps.memberName(guildId, session.userId)) === null) return fail(res, 'not_member');
  const { userId } = session;

  if (url.pathname === '/api/gear' && req.method === 'GET') return send(res, 200, await store.view(guildId, userId));
  if (url.pathname === '/api/gear/equip' && req.method === 'POST') {
    const copy = body?.copy;
    if (typeof copy !== 'string' || copy.length > 64) return fail(res, 'bad_request');
    if (!(await store.equip(guildId, userId, copy))) return fail(res, 'not_found');
    return send(res, 200, await store.view(guildId, userId));
  }
  if (url.pathname === '/api/gear/unequip' && req.method === 'POST') {
    const slot = body?.slot;
    if (typeof slot !== 'string' || !SLOTS.includes(slot as Slot)) return fail(res, 'bad_request');
    await store.unequip(guildId, userId, slot as Slot);
    return send(res, 200, await store.view(guildId, userId));
  }
  if (url.pathname === '/api/gear/unequip-all' && req.method === 'POST') {
    await store.unequipAll(guildId, userId);
    return send(res, 200, await store.view(guildId, userId));
  }
  if (url.pathname === '/api/gear/loadout' && req.method === 'POST') {
    const number = body?.loadout;
    if (typeof number !== 'number' || !LOADOUT_NUMBERS.includes(number)) return fail(res, 'bad_request');
    if (!(await store.switchLoadout(guildId, userId, number))) return fail(res, 'busy');
    return send(res, 200, await store.view(guildId, userId));
  }
  if (url.pathname === '/api/gear/refine' && req.method === 'POST') {
    const copy = body?.copy;
    if (typeof copy !== 'string' || copy.length > 64) return fail(res, 'bad_request');
    const result = await store.refine(guildId, userId, copy);
    if (result !== 'ok') return fail(res, result);
    return send(res, 200, await store.view(guildId, userId));
  }
  if (url.pathname === '/api/gear/forge' && req.method === 'POST') {
    const copy = body?.copy;
    if (typeof copy !== 'string' || copy.length > 64) return fail(res, 'bad_request');
    const result = await store.forge(guildId, userId, copy);
    if (result !== 'ok') return fail(res, result);
    return send(res, 200, await store.view(guildId, userId));
  }
  fail(res, 'not_found');
}

/** Answers a request under /api. Returns false for any other path. */
export async function handleApi(req: IncomingMessage, res: ServerResponse, deps: ApiDeps): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://bot');
  if (!url.pathname.startsWith('/api/')) return false;
  const { config } = deps;
  const secret = config.clientSecret;

  // The site calls from its own origin; nothing else is answered with data.
  if (req.headers.origin === config.origin) {
    res.setHeader('Access-Control-Allow-Origin', config.origin);
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600',
    });
    res.end();
    return true;
  }

  try {
    if (url.pathname === '/api/login' && req.method === 'GET') {
      const state = url.searchParams.get('state') ?? '';
      const clientId = deps.clientId();
      if (!secret || !clientId) return (fail(res, 'no_login'), true);
      if (!/^[\w-]{8,128}$/.test(state)) return (fail(res, 'bad_request'), true);
      res.writeHead(302, { Location: authorizeUrl(clientId, redirectUri(config), state), 'Cache-Control': 'no-store' });
      res.end();
      return true;
    }

    // Everything else is for the site only.
    if (req.headers.origin !== config.origin) return (fail(res, 'not_found'), true);

    // The same for everyone: no login needed.
    if (url.pathname === '/api/databank' && req.method === 'GET') {
      send(res, 200, databankView());
      return true;
    }

    // A game page asking with its link's token (to play, or to watch): no login needed.
    const gameToken = /^Game (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (gameToken && LIVE_PATHS.has(url.pathname)) {
      const viewer = verifyToken(gameToken) ?? verifyWatchToken(gameToken)?.viewer ?? null;
      if (!viewer || !deps.guild(viewer.guildId)) return (fail(res, 'not_logged_in'), true);
      await liveRoutes(req, res, url, deps, viewer);
      return true;
    }

    if (!secret) return (fail(res, 'no_login'), true);

    if (url.pathname === '/api/login' && req.method === 'POST') {
      const body = await readJson(req);
      const code = body?.code;
      const clientId = deps.clientId();
      if (typeof code !== 'string' || code.length > 256 || !clientId) return (fail(res, 'bad_request'), true);
      let login;
      try {
        login = await (deps.login ?? exchangeCode)(code, clientId, secret, redirectUri(config));
      } catch (err) {
        console.error('A login on the site failed:', err);
        return (fail(res, 'discord_failed'), true);
      }
      const session: Session = { userId: login.userId, name: login.name, avatar: login.avatar, guildIds: login.guildIds.filter((id) => deps.guild(id) !== null) };
      send(res, 200, { session: signSession(session, secret), me: await meFor(session, deps) });
      return true;
    }

    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    const session = bearer ? verifySession(bearer, secret) : null;
    if (!session) return (fail(res, 'not_logged_in'), true);

    if (url.pathname === '/api/me' && req.method === 'GET') {
      send(res, 200, await meFor(session, deps));
      return true;
    }

    // The front page, about one of the member's servers.
    if (LIVE_PATHS.has(url.pathname)) {
      const guildId = url.searchParams.get('guild') ?? '';
      if (!session.guildIds.includes(guildId) || !deps.guild(guildId)) return (fail(res, 'not_member'), true);
      const name = await deps.memberName(guildId, session.userId);
      if (name === null) return (fail(res, 'not_member'), true);
      if (url.pathname === '/api/live') hubSeen(guildId, session.userId, name);
      await liveRoutes(req, res, url, deps, { guildId, userId: session.userId, name });
      return true;
    }

    if (url.pathname.startsWith('/api/gear')) {
      await gearRoutes(req, res, url, deps, session);
      return true;
    }

    if (url.pathname === '/api/play' && req.method === 'POST') {
      const body = await readJson(req);
      const guildId = body?.guild;
      const game = body?.game;
      if (typeof guildId !== 'string' || typeof game !== 'string' || !(game in GAMES)) return (fail(res, 'bad_request'), true);
      if (!session.guildIds.includes(guildId) || !deps.guild(guildId)) return (fail(res, 'not_member'), true);
      const name = await deps.memberName(guildId, session.userId);
      if (name === null) return (fail(res, 'not_member'), true);
      const token = signToken({ guildId, userId: session.userId, name }, MINE_WEB.linkTtlMs);
      send(res, 200, { url: gameLink(config, game as Game, token) });
      return true;
    }

    fail(res, 'not_found');
  } catch (err) {
    console.error(`The site's ${req.method} ${url.pathname} failed:`, err);
    if (!res.headersSent) send(res, 500, { error: 'failed' });
  }
  return true;
}
