/*
 * Plinko.
 */

/** File name of the plinko board picture. */
export const PLINKO_IMAGE_NAME = 'plinko.png';

/**
 * How many rows of pegs the plinko board has. The ball bounces once per row, so the board has
 * PLINKO_ROWS + 1 slots. It must be even, from 2 to 10: the payouts are mirrored left to right, so
 * there is one payout setting for each slot from the edge to the middle (PLINKO_ROWS / 2 + 1 of them).
 */
export const PLINKO_ROWS = 8;

/** The plinko payout settings are multipliers of the bet, up to this many times it. */
export const MAX_PLINKO_MULTIPLIER = 1000;

/**
 * How the plinko drop plays: the picture is swapped every `frameMs` milliseconds as the ball falls
 * one row (keep it at 500 or more, Discord limits message edits). The ball takes PLINKO_ROWS + 1
 * pictures to land. `idleMs` is how long the buttons under a finished game (again, double, half)
 * keep working after the last time they were used.
 */
export const PLINKO_ANIMATION = { frameMs: 1_000 };

export const PLINKO_BUTTONS = { idleMs: 60_000 };
