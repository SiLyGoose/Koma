import { CONFIG } from '../../../config.js';
import { REFINE } from '../../../constants/index.js';
import { bestCopy } from './copies.js';
import { worstCopy } from './sell.js';
import { refineLevel } from './refine-share.js';
/*
 * The pure parts of refining gear (see constants/items/refine.ts for the rules): what a stored level
 * means, how much of an item's strength a level gives, and which copies a refine uses.
 */
export { leastStars, refineLevel, refineShare, starsOf } from './refine-share.js';
/** Whether `item`'s copies are ever refined: not TechnoMagic gear's, whose strength is each copy's potentials, which a level wouldn't change. */
export const refineable = (item) => !item.tmDrop;
/** The top refinement level of `item`'s copies: just R1 for an item that is never refined (refineable). */
export const maxLevelOf = (item) => (refineable(item) ? REFINE.maxLevel : 1);
/** What refining an item of `stars` up to level `to` costs in points, from the live settings (0 for a level with no price). */
export function refineCost(stars, to) {
    // (A hero's gear's first awakening, 0★ to 1★, is priced as the step after it: the settings start at ★2.)
    return CONFIG.refine.cost[stars]?.[Math.max(2, to)] ?? 0;
}
/**
 * Which of a member's copies of one item a refine raises, and which it uses up (the Discord `refine`). It raises their
 * highest-refined copy that isn't at the top level yet (so once one is maxed, the next one up is raised), and uses up
 * their lowest-level other copy that isn't worn, saved in a loadout (`kept`), maxed or locked, so no refining
 * is thrown away when it can be helped. `kept` includes the worn copies; left out, it is just those.
 */
export function refinePlan(copies, worn, kept = worn, least = 1) {
    const maxed = (copy) => refineLevel(copy.level, least) >= REFINE.maxLevel;
    const top = bestCopy(copies);
    if (!top)
        return { ok: false, reason: 'not_owned', level: 0 };
    const target = bestCopy(copies.filter((copy) => !maxed(copy)));
    if (!target)
        return { ok: false, reason: 'maxed', level: refineLevel(top.level, least), target: top };
    const from = refineLevel(target.level, least);
    // A copy that is fully refined, or that the member locked, is never used up.
    const fodder = worstCopy(copies.filter((copy) => copy._id !== target._id && !worn.has(copy._id) && !kept.has(copy._id) && !copy.locked && !maxed(copy)));
    if (!fodder)
        return { ok: false, reason: 'no_duplicate', level: from, target };
    return { ok: true, target, fodder, from, to: from + 1 };
}
/**
 * The copies a refine of `target` can use up: the member's other copies of its item that aren't worn,
 * saved in a loadout (`kept`, the worn ones included) or locked.
 */
export function refineMaterials(copies, target, kept) {
    return copies.filter((copy) => copy._id !== target._id && !kept.has(copy._id) && !copy.locked);
}
/**
 * A refine of the copy the member picked (the site's forge, where every copy is its own, whatever
 * level the others are at): it raises `targetId`, using up `materialId` (or, with none given, their
 * lowest-level copy it could use, as refinePlan picks). `kept` is the copies worn or in any loadout.
 */
export function refineCopyPlan(copies, targetId, materialId, kept, least = 1) {
    const target = copies.find((copy) => copy._id === targetId);
    if (!target)
        return { ok: false, reason: 'not_owned', level: 0 };
    const from = refineLevel(target.level, least);
    if (from >= REFINE.maxLevel)
        return { ok: false, reason: 'maxed', level: from, target };
    const materials = refineMaterials(copies, target, kept);
    if (materials.length === 0)
        return { ok: false, reason: 'no_duplicate', level: from, target };
    const fodder = materialId === null ? worstCopy(materials) : materials.find((copy) => copy._id === materialId);
    if (!fodder)
        return { ok: false, reason: 'bad_material', level: from, target };
    return { ok: true, target, fodder, from, to: from + 1 };
}
//# sourceMappingURL=refine.js.map