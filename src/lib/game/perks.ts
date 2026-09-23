import { MAX_REDUCTION } from '../../constants.js';
import { emptyTotals, type EffectTotals } from '../../data/effects.js';

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
  const delta = robber.robChance - victim.robDefense - victim.slothDefense;
  if (delta === 0) return base;
  const low = Math.min(base, limits.minChance);
  const high = Math.max(base, limits.maxChance);
  return clamp(base + delta, low, high);
}

/** How many times longer the wearer's rob cooldown is (1 with no sloth gear, 2 at +100%). */
export function robCooldownScale(gear: EffectTotals): number {
  return 1 + Math.max(0, gear.slothCooldown);
}

/**
 * How many clock hours the wearer waits between claims. The claim resets on the hour, so the
 * extra wait is counted in whole hours: 1 normally, 2 at +100% (every second hour). Never below 1.
 */
export function claimGapHours(gear: EffectTotals): number {
  return Math.max(1, Math.round(robCooldownScale(gear)));
}

/**
 * Points taken on a successful rob: boosted by the robber's gear (robAmount, and glassCannon on
 * top of it, each multiplying the amount), cut by the robber's own robAmountCut and by the
 * victim's shield. At least 1.
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

/** Fine a caught robber pays: raised by glassCannonPenalty, then cut by their caught protection. */
export function robFine(base: number, robber: EffectTotals): number {
  return Math.round(base * (1 + robber.glassCannonPenalty) * (1 - clamp(robber.fineReduction, 0, 1)));
}

/** The share (0 to 1) of the victim's next claim that a successful robber's gear taxes. */
export function claimTaxRate(robber: EffectTotals): number {
  return clamp(robber.claimTax, 0, 1);
}

/** Points taken from a claim of `amount` by a tax of `rate`. Never more than the claim. */
export function claimTaxAmount(amount: number, rate: number): number {
  return Math.min(amount, Math.max(0, Math.round(amount * rate)));
}

/** The share (0 to 1) of the victim's next successful rob that a successful robber's gear taxes. */
export function robTaxRate(robber: EffectTotals): number {
  return clamp(robber.robTax, 0, 1);
}

/** Points taken from a rob that stole `amount` by a tax of `rate`. Never more than the rob. */
export function robTaxAmount(amount: number, rate: number): number {
  return claimTaxAmount(amount, rate);
}

/** The chance (0 to 1) that a claim or successful rob by this gear spins the wheel. */
export function wheelChance(gear: EffectTotals): number {
  return clamp(gear.wheelSpin, 0, 1);
}

/** The chance (0 to 1) that a claim by this gear rolls the D20. */
export function d20Chance(gear: EffectTotals): number {
  return clamp(gear.d20, 0, 1);
}

/** Points from an hourly claim, after the claim bonus. */
export function claimAmount(rolled: number, gear: EffectTotals): number {
  return Math.round(rolled * (1 + gear.claimBonus));
}

/** Cost of a gacha pull, after the discount. Never below 1. */
export function pullCost(base: number, gear: EffectTotals): number {
  return Math.max(1, Math.round(base * (1 - Math.min(gear.pullDiscount, MAX_REDUCTION))));
}

/**
 * Ease-in-out: 0 at t=0, 1 at t=1, and (unlike a plain curve or a straight line) it crosses the
 * straight line y=x exactly at the halfway point -- below it for the first half (a slow start),
 * above it for the second (a fast finish). https://en.wikipedia.org/wiki/Smoothstep
 */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** How long, with no gear stretching it, a member waits between claims -- the curve's own "hour 1". */
const BASE_CLAIM_GAP_HOURS = claimGapHours(emptyTotals());

/**
 * The claim multiplier from STONKS!: 1x up through the member's earliest possible reclaim (gear
 * can stretch that wait -- see claimGapHours -- so this reads it live off `gear` too, the same
 * gear the multiplier itself is being asked about), then climbs on a smooth ease-in-out curve to
 * a cap (1 + gear.stackosaurus, the effect's strength) at `capHours` hours after that point, and
 * no higher after that. It climbs slower than a straight line for the first half of the wait and
 * faster than one for the second half, crossing that straight line exactly at the halfway point.
 * With the defaults (a 4-star cap of 7.5x, capHours 5, a 1-hour claim gap) that's 1x at hour 1,
 * climbing to 7.5x at hour 6, crossing the straight-line reference exactly at hour 3.5. Nothing
 * equipped (gear.stackosaurus 0) always returns 1x.
 */
export function stonksMultiplier(hoursUnclaimed: number, gear: EffectTotals, capHours: number): number {
  const cap = 1 + Math.max(0, gear.stackosaurus);
  if (!(cap > 1) || !(capHours > 0)) return 1;
  const waited = Math.max(0, hoursUnclaimed - claimGapHours(gear));
  const t = Math.min(1, waited / capHours);
  return 1 + (cap - 1) * smoothstep(t);
}

/**
 * A handful of points along STONKS!'s curve, for its own gear-card description (the numbers a
 * player actually sees, in multiplier form, not the raw "added percent" strength): at most 5
 * evenly spaced hour marks, always ending exactly at `capHours` hours after the earliest a claim
 * could be ready (BASE_CLAIM_GAP_HOURS -- this is the item's own generic description, not tied to
 * any one member's gear, so it assumes no sloth-style gear stretching that wait). Empty when
 * there's nothing to climb (`strength` 0 or less) or `capHours` isn't positive.
 */
export function stonksCurvePoints(strength: number, capHours: number): { hours: number; multiplier: number }[] {
  const cap = 1 + Math.max(0, strength);
  if (!(cap > 1) || !(capHours > 0)) return [];
  const count = Math.min(5, Math.max(1, Math.round(capHours)));
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 1) / count;
    return { hours: BASE_CLAIM_GAP_HOURS + t * capHours, multiplier: 1 + (cap - 1) * smoothstep(t) };
  });
}

/** Points after STONKS!, rounded, and at least 1 if it multiplied a real claim. A no-op at 1x. */
export function applyStonks(amount: number, multiplier: number): number {
  if (amount <= 0 || multiplier === 1) return amount;
  return Math.max(1, Math.round(amount * multiplier));
}
