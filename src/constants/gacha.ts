import type { Stars } from '../types.js';

/*
 * Gacha pulls and pity.
 */

/** How many pulls one multi pull (`gacha multi`) makes. It costs that many single pulls, and the results are shown in one embed, so keep it from 2 to 30. */
export const MULTI_PULLS = 10;

/** Highest pull count the pity settings accept. */
export const MAX_PITY = 1000;

/**
 * The star tier the pity system works on: a member's pity counts the pulls since their last item
 * of this tier, the chance of getting one rises as it grows, and one is guaranteed at the hard
 * pity pull (settings gacha.pity.*). Pity does nothing while this tier's pull weight is 0.
 */
export const PITY_STARS: Stars = 4;

/** File name of the pull animation (a GIF). */
export const GACHA_ANIMATION_NAME = 'shooting-star.gif';

/**
 * The shooting star shown on every pull (single or multi): it comes in from the left, a quarter of
 * the way up the night sky, and arcs over to the top right, silver-white, and warms into the
 * colour of the best item pulled from `igniteAt` of the way through its flight (0.5 is halfway). The
 * flight is `frames` pictures of `frameMs` each; then the colour flashes over the whole picture in
 * `flashFrames` more, and the brightest one is held for `holdMs` before the result replaces it
 * ((frames + flashFrames) x frameMs + holdMs in all). One GIF plays smoothly without editing the
 * message, so `frameMs` can be short; keep it at 20 or more (GIF counts in hundredths of a second).
 */
export const GACHA_ANIMATION = { frames: 50, flashFrames: 4, frameMs: 60, igniteAt: 0.4, holdMs: 500 };

/** The shooting star's colour for each star tier of the best item pulled (#rrggbb). */
export const STAR_COLORS: Readonly<Record<Stars, string>> = {
  1: '#3fe04a',
  2: '#4aa8ff',
  3: '#b36bff',
  4: '#ff4a5a',
};
