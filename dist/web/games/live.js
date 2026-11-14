/** How long a front page counts as on the site after it last asked who's online. */
export const HUB_TTL_MS = 30_000;
/** The most pages that can watch one player. */
export const MAX_WATCHERS = 20;
const key = (guildId, userId) => `${guildId}:${userId}`;
const roomKey = (game, guildId, userId) => `${game}:${key(guildId, userId)}`;
/** The games being played (or watched), by game and player. */
const rooms = new Map();
/** Front pages, by member: their name and when they last asked. */
const hubs = new Map();
function roomFor(game, guildId, userId, name) {
    const k = roomKey(game, guildId, userId);
    let room = rooms.get(k);
    if (!room) {
        room = { guildId, userId, name, game, player: null, watchers: new Set(), latest: null, status: '', since: Date.now() };
        rooms.set(k, room);
    }
    return room;
}
/** Forgets a room nobody is in any more. */
function tidy(room) {
    if (!room.player && room.watchers.size === 0)
        rooms.delete(roomKey(room.game, room.guildId, room.userId));
}
const tellCount = (room) => room.player?.send({ t: 'watchers', count: room.watchers.size });
// ---------------------------------------------------------------------------
// The player's side (the game servers)
/**
 * A player's page connected to `game`. Returns the peer the game should send through: it goes to the
 * page and to everyone watching (see mirror), and `describe` turns what it sends into the few words
 * of what they're doing for the online list (null: no change). The page is told how many are watching.
 */
export function playerJoined(game, guildId, userId, name, page, describe = () => null) {
    const room = roomFor(game, guildId, userId, name);
    room.player = page;
    room.name = name;
    if (room.watchers.size === 0)
        room.since = Date.now();
    const peer = {
        send: (message) => {
            page.send(message);
            if (room.player !== page)
                return;
            const status = describe(message);
            if (status !== null)
                room.status = status;
            mirror(room, message);
        },
        close: () => page.close(),
    };
    tellCount(room);
    return peer;
}
/** The player's page went away (another may take over). Watchers are told, and stay for when they're back. */
export function playerLeft(game, guildId, userId, page) {
    const room = rooms.get(roomKey(game, guildId, userId));
    if (!room || room.player !== page)
        return;
    room.player = null;
    for (const watcher of room.watchers)
        watcher.send({ t: 'away' });
    tidy(room);
}
/** Messages about the game (not errors, or the player's own watcher count) go to the watchers too, the latest kept for new ones. */
function mirror(room, message) {
    const t = message.t;
    if (t === 'error' || t === 'watchers' || t === 'refused' || t === 'map')
        return;
    if (t === 'state' || t === 'lobby' || t === 'table')
        room.latest = message;
    for (const watcher of room.watchers)
        watcher.send(message);
}
/** Sends something only the watchers should see (like the player starting to break a block). */
export function toWatchers(game, guildId, userId, message) {
    const room = rooms.get(roomKey(game, guildId, userId));
    if (room)
        for (const watcher of room.watchers)
            watcher.send(message);
}
/** A watch-only page wants to follow a player in `game`: it is sent who, and the game as it is. */
export function addWatcher(game, guildId, userId, page) {
    const room = rooms.get(roomKey(game, guildId, userId));
    if (!room?.player)
        return { ok: false, reason: 'not_playing' };
    if (room.watchers.size >= MAX_WATCHERS && !room.watchers.has(page))
        return { ok: false, reason: 'full' };
    room.watchers.add(page);
    page.send({ t: 'watching', player: room.name });
    if (room.latest)
        page.send({ ...room.latest, seq: 0 });
    tellCount(room);
    return { ok: true };
}
export function removeWatcher(game, guildId, userId, page) {
    const room = rooms.get(roomKey(game, guildId, userId));
    if (!room || !room.watchers.delete(page))
        return;
    tellCount(room);
    tidy(room);
}
/** Whether `userId` is being played right now in `game` (someone to watch). */
export const isPlaying = (game, guildId, userId) => rooms.get(roomKey(game, guildId, userId))?.player != null;
// ---------------------------------------------------------------------------
// Who's online
/** A member has the front page open (it asked who's online). */
export function hubSeen(guildId, userId, name, now = Date.now()) {
    const k = key(guildId, userId);
    const before = hubs.get(k);
    hubs.set(k, { guildId, userId, name, seenAt: now, since: before && now - before.seenAt < HUB_TTL_MS ? before.since : now });
}
/** Everyone on the site in a server: in a game if they're in one (the one they got to last), else on the front page. */
export function online(guildId, now = Date.now()) {
    const people = new Map();
    for (const room of rooms.values()) {
        if (room.guildId !== guildId || !room.player)
            continue;
        const before = people.get(room.userId);
        if (before && before.activity !== 'hub' && before.since > room.since)
            continue;
        people.set(room.userId, { userId: room.userId, name: room.name, activity: room.game, status: room.status, watchers: room.watchers.size, since: room.since });
    }
    for (const [k, hub] of hubs) {
        if (now - hub.seenAt >= HUB_TTL_MS) {
            hubs.delete(k);
            continue;
        }
        if (hub.guildId !== guildId || people.has(hub.userId))
            continue;
        people.set(hub.userId, { userId: hub.userId, name: hub.name, activity: 'hub', status: '', watchers: 0, since: hub.since });
    }
    return [...people.values()].sort((a, b) => a.since - b.since);
}
/** For tests: forgets everyone. */
export function resetLive() {
    rooms.clear();
    hubs.clear();
}
//# sourceMappingURL=live.js.map