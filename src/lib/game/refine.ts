import { REFINE } from '../../constants/index.js';
import type { ItemCopyDoc } from '../../types.js';
import { bestCopy } from './copies.js';
import { worstCopy } from './sell.js';

/*
 * The pure parts of refining gear (see constants/refine.ts for the rules): what a stored level
 * means, how much of an item's strength a level gives, and which copies a refine uses.
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

type CopyInfo = Pick<ItemCopyDoc, '_id' | 'level' | 'obtainedAt'>;

export type RefinePlan<T> =
  | { ok: true; target: T; fodder: T; from: number; to: number }
  | { ok: false; reason: 'not_owned' | 'no_duplicate' | 'maxed'; level: number };

/**
 * Which of a member's copies of one item a refine raises, and which it uses up. It raises the copy
 * they are wearing, else one saved in another of their loadouts (`kept`), else their best one, and
 * uses up their lowest-level other copy (never a worn or kept one), so no refining is thrown away
 * when it can be helped. `kept` includes the worn copies; left out, it is just those.
 */
export function refinePlan<T extends CopyInfo>(copies: readonly T[], worn: ReadonlySet<string>, kept: ReadonlySet<string> = worn): RefinePlan<T> {
  const target = copies.find((copy) => worn.has(copy._id)) ?? copies.find((copy) => kept.has(copy._id)) ?? bestCopy(copies);
  if (!target) return { ok: false, reason: 'not_owned', level: 0 };
  const from = refineLevel(target.level);
  if (from >= REFINE.maxLevel) return { ok: false, reason: 'maxed', level: from };
  const fodder = worstCopy(copies.filter((copy) => copy._id !== target._id && !worn.has(copy._id) && !kept.has(copy._id)));
  if (!fodder) return { ok: false, reason: 'no_duplicate', level: from };
  return { ok: true, target, fodder, from, to: from + 1 };
}
