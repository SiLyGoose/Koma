import type { ApiDeps } from '../api.js';
import { ApiError } from '../lib/errors.js';
import { bossPicture } from '../games/raid/picture.js';

/* The raid page's pictures, and raiders' gear as they fought (web/games/raid). */

export type RaidService = ReturnType<typeof raidService>;

export function raidService(deps: ApiDeps) {
  return {
    /** A boss's picture in a mood, as a PNG. */
    bossPicture(boss: string | null, mood: string | null): Buffer {
      const png = bossPicture(boss, mood);
      if (!png) throw new ApiError('not_found');
      return png;
    },

    /** A raider's gear as they fought the raid the page shows (its end screen), when it was kept. */
    async gear(guildId: string, userId: string): Promise<unknown> {
      const view = /^\w{1,32}$/.test(userId) ? await deps.raid?.gear?.(guildId, userId) : null;
      if (!view) throw new ApiError('not_found');
      return view;
    },
  };
}
