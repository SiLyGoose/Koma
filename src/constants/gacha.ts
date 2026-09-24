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
