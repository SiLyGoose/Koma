import { MAX_REDUCTION } from '../constants.js';
import { clamp } from './define.js';
import type { EffectTotals } from './index.js';

/*
 * The rob formulas where several perks meet. Each is a pure function: give it the base value and
 * the combined perk totals of whoever is involved and it returns the adjusted value. With nothing
 * equipped (all totals 0) every function returns its input unchanged. A new perk that changes one
 * of these numbers gets its own file and is added to the formula here.
 */

/**
 * Chance a rob succeeds: the base chance plus the robber's offense (robChance) minus the victim's
 * defense (robDefense, slothDefense). Gear can't push it below `minChance` or above `maxChance`;
 * a base chance already outside those limits is left alone unless gear moves it further.
 */
export function robSuccessChance(
  base: number,
  limits: { minChance: number; maxChance: number },
  robber: EffectTotals,
  victim: EffectTotals,
): number {
  const delta = robber.robChance - victim.robDefense - victim.slothDefense;
  if (delta === 0) return base;
  const low = Math.min(base, limits.minChance);
  const high = Math.max(base, limits.maxChance);
  return clamp(base + delta, low, high);
}

/**
 * Points taken on a successful rob: boosted by the robber's gear (robAmount, and glassCannon on
 * top of it, each multiplying the amount), cut by the robber's own robAmountCut and by the
 * victim's robShield. At least 1.
 */
export function robStolenAmount(rolled: number, robber: EffectTotals, victim: EffectTotals): number {
  const scaled =
    rolled *
    (1 + robber.robAmount) *
    (1 + robber.glassCannon) *
    (1 - Math.min(robber.robAmountCut, MAX_REDUCTION)) *
    (1 - Math.min(victim.robShield, MAX_REDUCTION));
  return Math.max(1, Math.round(scaled));
}

/** Fine a caught robber pays: raised by glassCannonPenalty, then cut by their fineReduction. */
export function robFine(base: number, robber: EffectTotals): number {
  return Math.round(base * (1 + robber.glassCannonPenalty) * (1 - clamp(robber.fineReduction, 0, 1)));
}
