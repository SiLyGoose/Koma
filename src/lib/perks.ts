import { MAX_REDUCTION } from '../constants.js';
import type { EffectTotals } from '../data/effects.js';

/*
 * What each equipment effect actually does to the numbers. These are pure functions: give them
 * the base value and the combined effect totals of whoever is involved and they return the
 * adjusted value. With nothing equipped (all totals 0) every function returns its input
 * unchanged. The services call these; add a function here when you add an effect.
 */

const clamp = (n: number, low: number, high: number): number => Math.min(high, Math.max(low, n));

/**
 * Chance a rob succeeds: the base chance plus the robber's offense minus the victim's defense.
 * Gear can't push it below `minChance` or above `maxChance`; a base chance already outside
 * those limits is left alone unless gear moves it further.
 */
export function robSuccessChance(
  base: number,
  limits: { minChance: number; maxChance: number },
  robber: EffectTotals,
  victim: EffectTotals,
): number {
  const delta = robber.robChance - victim.robDefense;
  if (delta === 0) return base;
  const low = Math.min(base, limits.minChance);
  const high = Math.max(base, limits.maxChance);
  return clamp(base + delta, low, high);
}

/** Points taken on a successful rob: boosted by the robber's gear, cut by the victim's. At least 1. */
export function robStolenAmount(rolled: number, robber: EffectTotals, victim: EffectTotals): number {
  const scaled = rolled * (1 + robber.robAmount) * (1 - Math.min(victim.robShield, MAX_REDUCTION));
  return Math.max(1, Math.round(scaled));
}

/** Fine a caught robber pays, after their caught protection. */
export function robFine(base: number, robber: EffectTotals): number {
  return Math.round(base * (1 - clamp(robber.fineReduction, 0, 1)));
}

/** Points from an hourly claim, after the claim bonus. */
export function claimAmount(rolled: number, gear: EffectTotals): number {
  return Math.round(rolled * (1 + gear.claimBonus));
}

/** Cost of a gacha pull, after the discount. Never below 1. */
export function pullCost(base: number, gear: EffectTotals): number {
  return Math.max(1, Math.round(base * (1 - Math.min(gear.pullDiscount, MAX_REDUCTION))));
}
