import { MINE_WEB } from '../../constants/index.js';
import { pinecraftLeaderboard, type PinecraftStat } from '../../services/pinecraft.js';
import type { ApiDeps } from '../api.js';
import { watchLink } from '../config.js';
import { ApiError } from '../lib/errors.js';
import { hubSeen, isPlaying, online } from '../games/live.js';
import { avatarUrl } from '../auth/login.js';
import { signWatchToken, type Player } from '../auth/token.js';
import { FRIENDS_MOST, WATCHABLE, type Friends, type Leaderboard, type Live, type WatchableGame } from '../../protocol/site.js';
import { HEROES_BY_ID } from '../../data/heroes.js';
import { STARTER_HERO } from '../../services/heroes.js';
import { friendStore, type FriendMember } from '../models/friends.js';

export { WATCHABLE, type Friends, type Leaderboard, type Live, type WatchableGame };

/* Who's on the site in a server (live.ts), the friends list (everyone there, on the site or not), watching them, and the Pinecraft leaderboard. */

/** How long a member found to have left a server isn't asked of Discord again (the friends list leaves them out meanwhile). */
const GONE_MS = 10 * 60_000;

/** The hero a member walks v2's town as: the one they said, else the first of theirs by name, else Roi (as the town has it). */
export function townHeroOf(member: FriendMember | undefined): string {
  if (!member) return STARTER_HERO;
  if (member.townHero && member.heroes.includes(member.townHero) && HEROES_BY_ID.has(member.townHero)) return member.townHero;
  const owned = member.heroes.flatMap((id) => HEROES_BY_ID.get(id) ?? []).sort((a, b) => a.name.localeCompare(b.name));
  return owned[0]?.id ?? STARTER_HERO;
}

export type LiveService = ReturnType<typeof liveService>;

export function liveService(deps: ApiDeps) {
  const friends = deps.friends ?? friendStore;
  /** Members found to have left a server, and when (by guild:user). */
  const gone = new Map<string, number>();
  async function nameOf(guildId: string, userId: string): Promise<string | null> {
    const k = `${guildId}:${userId}`;
    const left = gone.get(k);
    if (left !== undefined && Date.now() - left < GONE_MS) return null;
    const name = await deps.memberName(guildId, userId);
    if (name === null) gone.set(k, Date.now());
    else gone.delete(k);
    return name;
  }
  const avatarOf = (guildId: string, userId: string): string => deps.avatar?.(guildId, userId) ?? avatarUrl(userId, null);

  return {
    /** The front page asked: they count as being on the site. */
    seenOnFrontPage: (viewer: Player): void => hubSeen(viewer.guildId, viewer.userId, viewer.name),

    /** Who's on the site in the viewer's server. */
    online(viewer: Player): Live {
      const { guildId } = viewer;
      return {
        you: viewer.userId,
        players: online(guildId).map((p) => ({
          ...p,
          avatar: deps.avatar?.(guildId, p.userId) ?? avatarUrl(p.userId, null),
          // Only the games that can be watched (WATCHABLE, as POST /api/watch takes): the raids are joined as rooms instead,
          // minesweeper and Codedle are one board for the whole server, and poker's cards are each player's own.
          watchable: (WATCHABLE as readonly string[]).includes(p.activity) && p.userId !== viewer.userId,
        })),
      };
    },

    /** The friends list: everyone in the viewer's server the bot keeps anything for, those on the site first (the viewer among them). */
    async friends(viewer: Player): Promise<Friends> {
      const { guildId } = viewer;
      const members = await friends.members(guildId, FRIENDS_MOST);
      const byId = new Map(members.map((member) => [member.userId, member]));
      const here = online(guildId);
      const onSite = new Set(here.map((p) => p.userId));
      const on = here.map((p) => ({
        userId: p.userId,
        name: p.name,
        avatar: avatarOf(guildId, p.userId),
        hero: townHeroOf(byId.get(p.userId)),
        online: { activity: p.activity, status: p.status, since: p.since },
      }));
      const off = (
        await Promise.all(
          members
            .filter((member) => !onSite.has(member.userId))
            .map(async (member) => {
              const name = member.userId === viewer.userId ? viewer.name : await nameOf(guildId, member.userId);
              return name === null ? null : { userId: member.userId, name, avatar: avatarOf(guildId, member.userId), hero: townHeroOf(member), online: null };
            }),
        )
      )
        .filter((friend) => friend !== null)
        .sort((a, b) => a.name.localeCompare(b.name));
      return { you: viewer.userId, friends: [...on, ...off] };
    },

    /** Keeps the hero the viewer walks the town as, for the friends list: one they own, else a not_found. */
    async townHero(viewer: Player, hero: string): Promise<void> {
      if (!(await friends.townHero(viewer.guildId, viewer.userId, hero))) throw new ApiError('not_found');
    },

    /** The server's best miners by `stat`, and where the viewer stands. */
    async leaderboard(viewer: Player, stat: PinecraftStat): Promise<Leaderboard> {
      const { guildId } = viewer;
      const board = await (deps.leaderboard ?? pinecraftLeaderboard)(guildId, stat, viewer.userId);
      const rows = await Promise.all(
        board.top.map(async ({ userId, value }, i) => ({
          rank: i + 1,
          userId,
          name: (userId === viewer.userId ? viewer.name : await deps.memberName(guildId, userId)) ?? 'Someone who left',
          avatar: deps.avatar?.(guildId, userId) ?? avatarUrl(userId, null),
          value,
        })),
      );
      return { stat, rows, you: board.you && { rank: board.you.rank, value: board.you.value } };
    },

    /** A link for the viewer to watch `target` play `game`: not themselves, and only while they're playing it. */
    watchLink(viewer: Player, game: WatchableGame, target: string): string {
      if (target === viewer.userId) throw new ApiError('bad_request');
      if (!isPlaying(game, viewer.guildId, target)) throw new ApiError('not_playing');
      const token = signWatchToken({ viewer, targetId: target }, MINE_WEB.linkTtlMs);
      return watchLink(deps.config, game, token);
    },
  };
}
