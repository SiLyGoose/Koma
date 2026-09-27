/*
 * Who is on the games' site right now, and who is watching whom. Kept in memory: it only describes
 * this moment.
 *
 * Presence: a member is on the site while one of the games' pages is connected for them (mines-server.ts,
 * pinecraft-server.ts say so, and keep a short line of what they're doing up to date), or while the
 * front page keeps asking the bot who's online (api.ts; that counts for HUB_TTL_MS after each ask).
 *
 * Watching: anyone in the same server can open a watch-only page on someone playing a game (a watch
 * token, see token.ts). Everything the bot sends the player's page about the game is sent to their
 * watchers too (the player only ever sees what they have uncovered, so watchers do too), and the
 * last of it is kept so a new watcher starts on the board as it is. The player is told how many are
 * watching.
 */

export type LiveGame = 'mines' | 'pinecraft';
export type Activity = LiveGame | 'hub';

/** Something the bot can send a page: a WebSocket, or a fake one in tests. */
export interface LivePeer {
  send(message: unknown): void;
  close(): void;
}

/** How long a front page counts as on the site after it last asked who's online. */
export const HUB_TTL_MS = 30_000;
/** The most pages that can watch one player. */
export const MAX_WATCHERS = 20;

/** One member on the site, as the online list shows them. */
export interface Presence {
  userId: string;
  name: string;
  activity: Activity;
  /** What they're doing, like "100 on 3 mines · 1.50x". Empty on the front page. */
  status: string;
  /** How many are watching them (0 on the front page). */
  watchers: number;
  /** When they arrived at what they're doing (ms). */
  since: number;
}

interface Room {
  guildId: string;
  userId: string;
  name: string;
  game: LiveGame;
  /** The player's page, while one is connected. */
  player: LivePeer | null;
  watchers: Set<LivePeer>;
  /** The last word on the game sent to the player (their board or world), for new watchers. */
  latest: unknown;
  status: string;
  since: number;
}

const key = (guildId: string, userId: string): string => `${guildId}:${userId}`;
const roomKey = (game: LiveGame, guildId: string, userId: string): string => `${game}:${key(guildId, userId)}`;

/** The games being played (or watched), by game and player. */
const rooms = new Map<string, Room>();
/** Front pages, by member: their name and when they last asked. */
const hubs = new Map<string, { guildId: string; userId: string; name: string; seenAt: number; since: number }>();

function roomFor(game: LiveGame, guildId: string, userId: string, name: string): Room {
  const k = roomKey(game, guildId, userId);
  let room = rooms.get(k);
  if (!room) {
    room = { guildId, userId, name, game, player: null, watchers: new Set(), latest: null, status: '', since: Date.now() };
    rooms.set(k, room);
  }
  return room;
}

/** Forgets a room nobody is in any more. */
function tidy(room: Room): void {
  if (!room.player && room.watchers.size === 0) rooms.delete(roomKey(room.game, room.guildId, room.userId));
}

const tellCount = (room: Room): void => room.player?.send({ t: 'watchers', count: room.watchers.size });

// ---------------------------------------------------------------------------
// The player's side (the game servers)

/**
 * A player's page connected to `game`. Returns the peer the game should send through: it goes to the
 * page and to everyone watching (see mirror), and `describe` turns what it sends into the few words
 * of what they're doing for the online list (null: no change). The page is told how many are watching.
 */
export function playerJoined(game: LiveGame, guildId: string, userId: string, name: string, page: LivePeer, describe: (message: unknown) => string | null = () => null): LivePeer {
  const room = roomFor(game, guildId, userId, name);
  room.player = page;
  room.name = name;
  if (room.watchers.size === 0) room.since = Date.now();
  const peer: LivePeer = {
    send: (message) => {
      page.send(message);
      if (room.player !== page) return;
      const status = describe(message);
      if (status !== null) room.status = status;
      mirror(room, message);
    },
    close: () => page.close(),
  };
  tellCount(room);
  return peer;
}

/** The player's page went away (another may take over). Watchers are told, and stay for when they're back. */
export function playerLeft(game: LiveGame, guildId: string, userId: string, page: LivePeer): void {
  const room = rooms.get(roomKey(game, guildId, userId));
  if (!room || room.player !== page) return;
  room.player = null;
  for (const watcher of room.watchers) watcher.send({ t: 'away' });
  tidy(room);
}

/** Messages about the game (not errors, or the player's own watcher count) go to the watchers too, the latest kept for new ones. */
function mirror(room: Room, message: unknown): void {
  const t = (message as { t?: unknown }).t;
  if (t === 'error' || t === 'watchers' || t === 'refused' || t === 'map') return;
  if (t === 'state' || t === 'lobby') room.latest = message;
  for (const watcher of room.watchers) watcher.send(message);
}

/** Sends something only the watchers should see (like the player starting to break a block). */
export function toWatchers(game: LiveGame, guildId: string, userId: string, message: unknown): void {
  const room = rooms.get(roomKey(game, guildId, userId));
  if (room) for (const watcher of room.watchers) watcher.send(message);
}

// ---------------------------------------------------------------------------
// The watchers' side

export type WatchResult = { ok: true } | { ok: false; reason: 'not_playing' | 'full' };

/** A watch-only page wants to follow a player in `game`: it is sent who, and the game as it is. */
export function addWatcher(game: LiveGame, guildId: string, userId: string, page: LivePeer): WatchResult {
  const room = rooms.get(roomKey(game, guildId, userId));
  if (!room?.player) return { ok: false, reason: 'not_playing' };
  if (room.watchers.size >= MAX_WATCHERS && !room.watchers.has(page)) return { ok: false, reason: 'full' };
  room.watchers.add(page);
  page.send({ t: 'watching', player: room.name });
  if (room.latest) page.send({ ...(room.latest as object), seq: 0 });
  tellCount(room);
  return { ok: true };
}

export function removeWatcher(game: LiveGame, guildId: string, userId: string, page: LivePeer): void {
  const room = rooms.get(roomKey(game, guildId, userId));
  if (!room || !room.watchers.delete(page)) return;
  tellCount(room);
  tidy(room);
}

/** Whether `userId` is being played right now in `game` (someone to watch). */
export const isPlaying = (game: LiveGame, guildId: string, userId: string): boolean => rooms.get(roomKey(game, guildId, userId))?.player != null;

// ---------------------------------------------------------------------------
// Who's online

/** A member has the front page open (it asked who's online). */
export function hubSeen(guildId: string, userId: string, name: string, now = Date.now()): void {
  const k = key(guildId, userId);
  const before = hubs.get(k);
  hubs.set(k, { guildId, userId, name, seenAt: now, since: before && now - before.seenAt < HUB_TTL_MS ? before.since : now });
}

/** Everyone on the site in a server: in a game if they're in one (the one they got to last), else on the front page. */
export function online(guildId: string, now = Date.now()): Presence[] {
  const people = new Map<string, Presence>();
  for (const room of rooms.values()) {
    if (room.guildId !== guildId || !room.player) continue;
    const before = people.get(room.userId);
    if (before && before.activity !== 'hub' && before.since > room.since) continue;
    people.set(room.userId, { userId: room.userId, name: room.name, activity: room.game, status: room.status, watchers: room.watchers.size, since: room.since });
  }
  for (const [k, hub] of hubs) {
    if (now - hub.seenAt >= HUB_TTL_MS) {
      hubs.delete(k);
      continue;
    }
    if (hub.guildId !== guildId || people.has(hub.userId)) continue;
    people.set(hub.userId, { userId: hub.userId, name: hub.name, activity: 'hub', status: '', watchers: 0, since: hub.since });
  }
  return [...people.values()].sort((a, b) => a.since - b.since);
}

/** For tests: forgets everyone. */
export function resetLive(): void {
  rooms.clear();
  hubs.clear();
}
