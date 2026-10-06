import { RAID_BOSS_IDS, type RaidBossId } from '../../../constants/index.js';
import { dragonPicture, type DragonMood } from '../../../animations/images/dragon-image.js';
import { reaperPicture } from '../../../animations/images/reaper-image.js';

/*
 * The raid boss's pictures for the site (GET /api/raid/boss?boss=&mood=): the same ones the raid
 * message in Discord shows.
 */

const MOODS: readonly DragonMood[] = ['calm', 'enraged', 'furious', 'shielded', 'defeated', 'gloating', 'fled'];

/** The picture of `boss` in `mood`, or null when either isn't one. */
export function bossPicture(boss: string | null, mood: string | null): Buffer | null {
  if (!RAID_BOSS_IDS.includes(boss as RaidBossId) || !MOODS.includes(mood as DragonMood)) return null;
  return boss === 'reaper' ? reaperPicture(mood as DragonMood) : dragonPicture(mood as DragonMood);
}
