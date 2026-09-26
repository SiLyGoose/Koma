import { REFINE } from '../../constants/index.js';

/*
 * What a refinement level is worth, on its own so that perks can use it: it depends only on the
 * constants, while the rest of refining (refine.ts) reaches the item catalog and the settings.
 */

/** A copy's refinement level, from 1 to REFINE.maxLevel. Copies from before refining existed are stored as 0, which is 1. */
export const refineLevel = (stored: number): number => Math.min(REFINE.maxLevel, Math.max(1, Math.floor(stored)));

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
