import { MINE_WEB } from '../../constants/index.js';
import { pinecraftLeaderboard } from '../../services/pinecraft.js';
import { watchLink } from '../config.js';
import { ApiError } from '../lib/errors.js';
import { hubSeen, isPlaying, online } from '../games/live.js';
import { avatarUrl } from '../auth/login.js';
import { signWatchToken } from '../auth/token.js';
import { dragonRooms, technomagicRooms } from '../games/technomagic/room.js';
import { FRIENDS_MOST, JOINABLE, WATCHABLE } from '../../protocol/site.js';
import { HEROES_BY_ID } from '../../data/heroes.js';
import { STARTER_HERO } from '../../services/heroes.js';
import { friendStore } from '../models/friends.js';
export { WATCHABLE };
/* Who's on the site in a server (live.ts), the friends list (everyone there, on the site or not), watching them, and the Pinecraft leaderboard. */
/** How long a member found to have left a server isn't asked of Discord again (the friends list leaves them out meanwhile). */
const GONE_MS = 10 * 60_000;
/** The hero a member walks v2's town as: the one they said, else the first of theirs by name, else Roi (as the town has it). */
export function townHeroOf(member) {
    if (!member)
        return STARTER_HERO;
    if (member.townHero && member.heroes.includes(member.townHero) && HEROES_BY_ID.has(member.townHero))
        return member.townHero;
    const owned = member.heroes.flatMap((id) => HEROES_BY_ID.get(id) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    return owned[0]?.id ?? STARTER_HERO;
}
/**
 * Whether the friends list shows them: only those with a hero of their own. Anyone with none would only stand there as the
 * default Roi, not yet having been to the town (it gives Roi to whoever comes with no hero), so they're left out; the one
 * asking is always shown.
 */
export function listedFriend(member) {
    return !!member && member.heroes.some((id) => HEROES_BY_ID.has(id));
}
/**
 * Whether the viewer can watch `userId` doing `activity`: only the games that can be watched (WATCHABLE, as POST /api/watch
 * takes: the raids among them; minesweeper and Codedle are one board for the whole server, and poker's cards are each
 * player's own), and not themselves.
 */
const watchable = (activity, userId, viewer) => WATCHABLE.includes(activity) && userId !== viewer.userId;
/** The raid `userId` is in, if the viewer could join it now (not their own: they're in it already). */
function joinOf(rooms, activity, guildId, userId, viewer) {
    if (userId === viewer.userId || !JOINABLE.includes(activity))
        return null;
    return rooms[activity].joinableOf(guildId, userId);
}
export function liveService(deps, rooms = { technomagic: technomagicRooms, dragon: dragonRooms }) {
    const friends = deps.friends ?? friendStore;
    /** Members found to have left a server, and when (by guild:user). */
    const gone = new Map();
    async function nameOf(guildId, userId) {
        const k = `${guildId}:${userId}`;
        const left = gone.get(k);
        if (left !== undefined && Date.now() - left < GONE_MS)
            return null;
        const name = await deps.memberName(guildId, userId);
        if (name === null)
            gone.set(k, Date.now());
        else
            gone.delete(k);
        return name;
    }
    const avatarOf = (guildId, userId) => deps.avatar?.(guildId, userId) ?? avatarUrl(userId, null);
    return {
        /** The front page asked: they count as being on the site. */
        seenOnFrontPage: (viewer) => hubSeen(viewer.guildId, viewer.userId, viewer.name),
        /** Who's on the site in the viewer's server. */
        online(viewer) {
            const { guildId } = viewer;
            return {
                you: viewer.userId,
                players: online(guildId).map((p) => ({
                    ...p,
                    avatar: deps.avatar?.(guildId, p.userId) ?? avatarUrl(p.userId, null),
                    watchable: watchable(p.activity, p.userId, viewer),
                })),
            };
        },
        /** The friends list: everyone in the viewer's server with a hero (listedFriend), those on the site first (the viewer among them). */
        async friends(viewer) {
            const { guildId } = viewer;
            const members = await friends.members(guildId, FRIENDS_MOST);
            const byId = new Map(members.map((member) => [member.userId, member]));
            const here = online(guildId);
            const onSite = new Set(here.map((p) => p.userId));
            const shown = (userId) => userId === viewer.userId || listedFriend(byId.get(userId));
            const on = here.filter((p) => shown(p.userId)).map((p) => {
                const join = joinOf(rooms, p.activity, guildId, p.userId, viewer);
                return {
                    userId: p.userId,
                    name: p.name,
                    avatar: avatarOf(guildId, p.userId),
                    hero: townHeroOf(byId.get(p.userId)),
                    online: { activity: p.activity, status: p.status, since: p.since, watchable: watchable(p.activity, p.userId, viewer), ...(join && { join }) },
                };
            });
            const off = (await Promise.all(members
                .filter((member) => !onSite.has(member.userId) && shown(member.userId))
                .map(async (member) => {
                const name = member.userId === viewer.userId ? viewer.name : await nameOf(guildId, member.userId);
                return name === null ? null : { userId: member.userId, name, avatar: avatarOf(guildId, member.userId), hero: townHeroOf(member), online: null };
            })))
                .filter((friend) => friend !== null)
                .sort((a, b) => a.name.localeCompare(b.name));
            return { you: viewer.userId, friends: [...on, ...off] };
        },
        /** Keeps the hero the viewer walks the town as, for the friends list: one they own, else a not_found. */
        async townHero(viewer, hero) {
            if (!(await friends.townHero(viewer.guildId, viewer.userId, hero)))
                throw new ApiError('not_found');
        },
        /** The server's best miners by `stat`, and where the viewer stands. */
        async leaderboard(viewer, stat) {
            const { guildId } = viewer;
            const board = await (deps.leaderboard ?? pinecraftLeaderboard)(guildId, stat, viewer.userId);
            const rows = await Promise.all(board.top.map(async ({ userId, value }, i) => ({
                rank: i + 1,
                userId,
                name: (userId === viewer.userId ? viewer.name : await deps.memberName(guildId, userId)) ?? 'Someone who left',
                avatar: deps.avatar?.(guildId, userId) ?? avatarUrl(userId, null),
                value,
            })));
            return { stat, rows, you: board.you && { rank: board.you.rank, value: board.you.value } };
        },
        /** A link for the viewer to watch `target` play `game`: not themselves, and only while they're playing it. */
        watchLink(viewer, game, target) {
            if (target === viewer.userId)
                throw new ApiError('bad_request');
            if (!isPlaying(game, viewer.guildId, target))
                throw new ApiError('not_playing');
            const token = signWatchToken({ viewer, targetId: target }, MINE_WEB.linkTtlMs);
            return watchLink(deps.config, game, token);
        },
    };
}
//# sourceMappingURL=live.js.map