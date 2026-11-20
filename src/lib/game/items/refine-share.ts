import { REFINE } from '../../../constants/index.js';
import type { ItemDef } from '../../../types.js';

/*
 * What a refinement level is worth, on its own so that perks can use it: it depends only on the
 * constants, while the rest of refining (refine.ts) reaches the item catalog and the settings.
 */

/**
 * A copy's level, its stars (King's Raid's), from `least` to REFINE.maxLevel: the members' own gear's from 1★ (copies from
 * before refining existed are stored as 0, which is 1★); a hero's gear's from 0★ (leastStars, starsOf).
 */
export const refineLevel = (stored: number, least = 1): number => Math.min(REFINE.maxLevel, Math.max(least, Math.floor(stored)));

/** The fewest stars an item's copy has: a hero's gear 0★ (King's Raid's: it is awakened from there), the members' own 1★. */
export const leastStars = (item: Pick<ItemDef, 'kr' | 'tmDrop' | 'uniqueWeapon' | 'uniqueTreasure'>): number =>
  item.kr !== undefined || item.tmDrop === true || item.uniqueWeapon !== undefined || item.uniqueTreasure !== undefined ? 0 : 1;

/** A copy's stars, by its item (refineLevel from its leastStars). */
export const starsOf = (item: Pick<ItemDef, 'kr' | 'tmDrop' | 'uniqueWeapon' | 'uniqueTreasure'>, stored: number): number => refineLevel(stored, leastStars(item));

/** How many steps up a level is, counting level 1 as one step (a big step counts as REFINE.bigStep). */
function steps(level: number): number {
  let total = 1;
  for (let l = 2; l <= level; l++) total += REFINE.bigSteps.includes(l) ? REFINE.bigStep : 1;
  return total;
}

/** The share (0 to 1) of an item's full strength a copy at this level gives: 1 at REFINE.maxLevel. */
export function refineShare(level: number): number {
  return steps(refineLevel(level)) / steps(REFINE.maxLevel);
}
