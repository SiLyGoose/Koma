import { ApiError } from '../lib/errors.js';
import { bossPicture } from '../games/raid/picture.js';
export function raidService(deps) {
    return {
        /** A boss's picture in a mood, as a PNG. */
        bossPicture(boss, mood) {
            const png = bossPicture(boss, mood);
            if (!png)
                throw new ApiError('not_found');
            return png;
        },
        /** How `guildId`'s raid stands: this week's boss, and how far its difficulty is unlocked. */
        async week(guildId) {
            const week = await deps.raid?.week(guildId);
            if (!week)
                throw new ApiError('not_found');
            return { boss: week.boss, maxDifficulty: week.maxDifficulty, resetsAt: week.resetsAt };
        },
        /** A raider's gear as they fought the raid the page shows (its end screen), when it was kept. */
        async gear(guildId, userId) {
            const view = /^\w{1,32}$/.test(userId) ? await deps.raid?.gear?.(guildId, userId) : null;
            if (!view)
                throw new ApiError('not_found');
            return view;
        },
    };
}
//# sourceMappingURL=raid.js.map