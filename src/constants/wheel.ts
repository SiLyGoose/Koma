/*
 * The Wheelchair's prize wheel: limits and animation. The slices themselves are in perks/wheel-spin/slices.ts.
 */

/** Most slices the prize wheel (perks/wheel-spin/slices.ts) may have, so the picture stays readable. */
export const MAX_WHEEL_SLICES = 16;

/** Largest multiplier a wheel slice may have. */
export const MAX_WHEEL_MULTIPLIER = 100;

/** File name of the wheel picture attached to a claim or rob reply. */
export const WHEEL_IMAGE_NAME = 'wheel.png';

/**
 * How the wheel animation plays. The reply first shows the wheel spinning, then the picture is
 * swapped every `frameMs` milliseconds (the wheel slowing down each time) until the spin has
 * lasted somewhere from `minSeconds` to `maxSeconds`, and the wheel stops on the result. Discord
 * limits how often a message can be edited, so keep `frameMs` at 1000 or more.
 */
export const WHEEL_ANIMATION = { frameMs: 1_000, minSeconds: 3, maxSeconds: 5 };
