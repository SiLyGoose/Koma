import { dragonPicture } from './dragon-image.js';
import { plaguePicture } from './plague-image.js';
import { reaperPicture } from './reaper-image.js';
/** Each raid boss's picture, by mood (every boss has the dragon's moods). */
const PICTURES = {
    wyrm: dragonPicture,
    reaper: reaperPicture,
    plague: plaguePicture,
};
/** The picture of `boss` in `mood`, as a PNG (each is drawn once, then kept). */
export const raidBossPicture = (boss, mood) => PICTURES[boss](mood);
//# sourceMappingURL=raid-boss-image.js.map