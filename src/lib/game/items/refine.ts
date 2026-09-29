import { CONFIG, type RefineTarget } from '../../../config.js';
import { REFINE } from '../../../constants/index.js';
import type { ItemCopyDoc, Stars } from '../../../types.js';
import { bestCopy } from './copies.js';
import { worstCopy } from './sell.js';
import { refineLevel } from './refine-share.js';

/*
 * The pure parts of refining gear (see constants/items/refine.ts for the rules): what a stored level
 * means, how much of an item's strength a level gives, and which copies a refine uses.
 */

export { refineLevel, refineShare } from './refine-share.js';

/** What refining an item of `stars` up to level `to` costs in points, from the live settings (0 for a level with no price). */
export function refineCost(stars: Stars, to: number): number {
  return CONFIG.refine.cost[stars]?.[to as RefineTarget] ?? 0;
}

type CopyInfo = Pick<ItemCopyDoc, '_id' | 'level' | 'obtainedAt' | 'masterwork'>;

export type RefinePlan<T> =
  | { ok: true; target: T; fodder: T; from: number; to: number }
  | { ok: false; reason: 'not_owned'; level: number }
  /** `target` is the copy a refine would have raised. */
  | { ok: false; reason: 'no_duplicate' | 'maxed'; level: number; target: T };

/**
 * Which of a member's copies of one item a refine raises, and which it uses up (the Discord `refine`). It raises their
 * highest-refined copy that isn't at the top level yet (so once one is maxed, the next one up is raised), and uses up
 * their lowest-level other copy that isn't worn, saved in a loadout (`kept`), maxed or a masterwork, so no refining
 * is thrown away when it can be helped. `kept` includes the worn copies; left out, it is just those.
 */
export function refinePlan<T extends CopyInfo>(copies: readonly T[], worn: ReadonlySet<string>, kept: ReadonlySet<string> = worn): RefinePlan<T> {
  const maxed = (copy: T) => refineLevel(copy.level) >= REFINE.maxLevel;
  const top = bestCopy(copies);
  if (!top) return { ok: false, reason: 'not_owned', level: 0 };
  const target = bestCopy(copies.filter((copy) => !maxed(copy)));
  if (!target) return { ok: false, reason: 'maxed', level: refineLevel(top.level), target: top };
  const from = refineLevel(target.level);
  // A copy whose refine bonus was bought with komaGems, or that is fully refined, is never used up.
  const fodder = worstCopy(
    copies.filter((copy) => copy._id !== target._id && !worn.has(copy._id) && !kept.has(copy._id) && !copy.masterwork && !maxed(copy)),
  );
  if (!fodder) return { ok: false, reason: 'no_duplicate', level: from, target };
  return { ok: true, target, fodder, from, to: from + 1 };
}

/** A refine of one chosen copy: as RefinePlan, or the material asked for can't be used up. */
export type RefineCopyPlan<T> = RefinePlan<T> | { ok: false; reason: 'bad_material'; level: number; target: T };

/**
 * The copies a refine of `target` can use up: the member's other copies of its item that aren't worn,
 * saved in a loadout (`kept`, the worn ones included) or a masterwork.
 */
export function refineMaterials<T extends CopyInfo>(copies: readonly T[], target: T, kept: ReadonlySet<string>): T[] {
  return copies.filter((copy) => copy._id !== target._id && !kept.has(copy._id) && !copy.masterwork);
}

/**
 * A refine of the copy the member picked (the site's forge, where every copy is its own, whatever
 * level the others are at): it raises `targetId`, using up `materialId` (or, with none given, their
 * lowest-level copy it could use, as refinePlan picks). `kept` is the copies worn or in any loadout.
 */
export function refineCopyPlan<T extends CopyInfo>(
  copies: readonly T[],
  targetId: string,
  materialId: string | null,
  kept: ReadonlySet<string>,
): RefineCopyPlan<T> {
  const target = copies.find((copy) => copy._id === targetId);
  if (!target) return { ok: false, reason: 'not_owned', level: 0 };
  const from = refineLevel(target.level);
  if (from >= REFINE.maxLevel) return { ok: false, reason: 'maxed', level: from, target };
  const materials = refineMaterials(copies, target, kept);
  if (materials.length === 0) return { ok: false, reason: 'no_duplicate', level: from, target };
  const fodder = materialId === null ? worstCopy(materials) : materials.find((copy) => copy._id === materialId);
  if (!fodder) return { ok: false, reason: 'bad_material', level: from, target };
  return { ok: true, target, fodder, from, to: from + 1 };
}
