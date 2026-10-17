import type { PinecraftStat } from './pinecraft.js';

/* The site's own calls to the bot: logging in, who is logged in and where they can play, who is on the site, watching them, and the Pinecraft leaderboard. */

/** The games on the site, each a page of its own (the bot's web/config.ts GAMES says where). */
export const GAME_IDS = ['mines', 'pinecraft', 'baccarat', 'roulette', 'poker', 'raid', 'minesweeper', 'technomagic', 'dragon'] as const;
export type Game = (typeof GAME_IDS)[number];

/** Who is logged in, and where they can play. */
export interface Me {
  user: { id: string; name: string; avatar: string };
  servers: { id: string; name: string; icon: string | null; balance: number }[];
  games: Game[];
  /** Whether they're the bot admin, who can change the bot's settings on the site's admin page (./admin.ts). */
  admin: boolean;
}

/** Who's on the site in a server (GET /api/live). */
export interface Live {
  /** The one asking. */
  you: string;
  players: {
    userId: string;
    name: string;
    avatar: string;
    activity: 'hub' | Game;
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
export const WATCHABLE = ['mines', 'pinecraft', 'baccarat', 'roulette'] as const satisfies readonly Game[];

export type WatchableGame = (typeof WATCHABLE)[number];

/** POST /api/login: the session (kept by the page, sent with every call after), and who it is. */
export interface LogIn {
  session: string;
  me: Me;
}

/** POST /api/play and /api/watch: the link to open. */
export interface Link {
  url: string;
}
