import type { RaidBossId } from '../../constants/index.js';
import { dragonPicture, type DragonMood } from './dragon-image.js';
import { plaguePicture } from './plague-image.js';
import { reaperPicture } from './reaper-image.js';

/** Each raid boss's picture, by mood (every boss has the dragon's moods). */
const PICTURES: Readonly<Record<RaidBossId, (mood: DragonMood) => Buffer>> = {
  wyrm: dragonPicture,
  reaper: reaperPicture,
  plague: plaguePicture,
};

/** The picture of `boss` in `mood`, as a PNG (each is drawn once, then kept). */
export const raidBossPicture = (boss: RaidBossId, mood: DragonMood): Buffer => PICTURES[boss](mood);
