/*
 * Refining gear (commands/refine.ts). Every copy of an item has a refinement level from 1 to
 * `maxLevel`: a new copy starts at 1, and each refine uses up one duplicate copy of the same item to
 * raise it by one.
 *
 * An item's perk strengths in the settings (equipment.<perk>.<stars>) are its strengths at
 * `maxLevel`. Lower levels get a share of them that climbs in equal steps, except that the steps
 * into the levels in `bigSteps` are worth `bigStep` normal steps. With the defaults that is 6 steps
 * in all: 1/6 at R1, 2/6 at R2, exactly half at R3, 4/6 at R4 and all of it at R5.
 *
 * Levels are shown as "R" and the number: R1 to R5.
 */
export const REFINE = {
  maxLevel: 5,
  bigSteps: [5] as readonly number[],
  bigStep: 2,
} as const;
