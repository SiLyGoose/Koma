import type { ApiDeps } from '../api.js';
import { ApiError } from '../lib/errors.js';
import { bossPicture } from '../games/raid/picture.js';

/* The raid page's pictures, raiders' gear as they fought (web/games/raid), and how a server's raid stands for the databank. */

/** GET /api/raid/week: a server's raid, for the databank's boss pages. */
export interface RaidWeekView {
  /** This week's boss there. */
  boss: string;
  /** The hardest difficulty the server can pick (one past the hardest it has beaten). */
  maxDifficulty: number;
  /** When the week's raid resets (ms). */
  resetsAt: number;
}

export type RaidService = ReturnType<typeof raidService>;

export function raidService(deps: ApiDeps) {
  return {
    /** A boss's picture in a mood, as a PNG. */
    bossPicture(boss: string | null, mood: string | null): Buffer {
      const png = bossPicture(boss, mood);
      if (!png) throw new ApiError('not_found');
      return png;
    },

    /** How `guildId`'s raid stands: this week's boss, and how far its difficulty is unlocked. */
    async week(guildId: string): Promise<RaidWeekView> {
      const week = await deps.raid?.week(guildId);
      if (!week) throw new ApiError('not_found');
      return { boss: week.boss, maxDifficulty: week.maxDifficulty, resetsAt: week.resetsAt };
    },

    /** A raider's gear as they fought the raid the page shows (its end screen), when it was kept. */
    async gear(guildId: string, userId: string): Promise<unknown> {
      const view = /^\w{1,32}$/.test(userId) ? await deps.raid?.gear?.(guildId, userId) : null;
      if (!view) throw new ApiError('not_found');
      return view;
    },
  };
}
