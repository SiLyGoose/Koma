import { MINE_WEB } from '../../constants/index.js';
import { pinecraftLeaderboard, type PinecraftStat } from '../../services/pinecraft.js';
import type { ApiDeps } from '../api.js';
import { watchLink } from '../config.js';
import { ApiError } from '../errors.js';
import { hubSeen, isPlaying, online, type LiveGame } from '../live.js';
import { avatarUrl } from '../login.js';
import { signWatchToken, type Player } from '../token.js';

/* Who's on the site in a server (live.ts), watching them, and the Pinecraft leaderboard. */

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

/** A Pinecraft leaderboard (GET /api/pinecraft/leaderboard): the best miners by `stat`, and where the one asking stands. */
export interface Leaderboard {
  stat: PinecraftStat;
  rows: { rank: number; userId: string; name: string; avatar: string; value: number }[];
  you: { rank: number; value: number } | null;
}

/** The games that can be watched. */
export const WATCHABLE = ['mines', 'pinecraft', 'baccarat', 'roulette'] as const satisfies readonly LiveGame[];
export type WatchableGame = (typeof WATCHABLE)[number];

export type LiveService = ReturnType<typeof liveService>;

export function liveService(deps: ApiDeps) {
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
          // The raid has no watching: anyone in the server can open the raid itself.
          watchable: p.activity !== 'hub' && p.activity !== 'raid' && p.userId !== viewer.userId,
        })),
      };
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
