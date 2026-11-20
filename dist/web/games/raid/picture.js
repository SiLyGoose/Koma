import { RAID_BOSS_IDS } from '../../../constants/index.js';
import { raidBossPicture } from '../../../animations/images/raid-boss-image.js';
/*
 * The raid boss's pictures for the site (GET /api/raid/boss?boss=&mood=): the same ones the raid
 * message in Discord shows.
 */
const MOODS = ['calm', 'enraged', 'furious', 'shielded', 'defeated', 'gloating', 'fled'];
/** The picture of `boss` in `mood`, or null when either isn't one. */
export function bossPicture(boss, mood) {
    if (!RAID_BOSS_IDS.includes(boss) || !MOODS.includes(mood))
        return null;
    return raidBossPicture(boss, mood);
}
//# sourceMappingURL=picture.js.map