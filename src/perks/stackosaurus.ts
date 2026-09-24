import { formatMultiplier, formatPercent } from '../lib/format.js';
import { definePerk } from './define.js';
import type { EffectTotals } from './index.js';
import { claimGapHours } from './stats.js';

/*
 * STONKS!'s perk: no roll, no chance, just time. 1x through the wearer's earliest possible reclaim
 * (gear that stretches the claim gap, like Sid the Sloth's slothCooldown, pushes this out too),
 * then a smooth ease-in-out climb -- slower than a straight line at first, faster than one later,
 * crossing it exactly halfway through -- up to a cap (this perk's strength, as an added percent:
 * 100% is a cap of 2x, same convention as glassCannon) stonks.capHours hours after that point,
 * and no higher after that.
 */

/**
 * Ease-in-out: 0 at t=0, 1 at t=1, and (unlike a plain curve or a straight line) it crosses the
 * straight line y=x exactly at the halfway point -- below it for the first half (a slow start),
 * above it for the second (a fast finish). https://en.wikipedia.org/wiki/Smoothstep
 */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * How long, with no gear stretching it, a member waits between claims -- the curve's own "hour 1".
 * A function, not a value worked out at load: the perk registry (which the stats need) loads this
 * file before it is ready.
 */
const baseClaimGapHours = (): number => claimGapHours({});

/**
 * The claim multiplier from STONKS!: 1x up through the member's earliest possible reclaim (gear
 * can stretch that wait -- see claimGapHours -- so this reads it live off `gear` too, the same
 * gear the multiplier itself is being asked about), then climbs on a smooth ease-in-out curve to
 * a cap (1 + gear.stackosaurus, the perk's strength) at `capHours` hours after that point, and
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
 * A handful of points along STONKS!'s curve, for its own gear-card line (the numbers a player
 * actually sees, in multiplier form, not the raw "added percent" strength): at most 5 evenly
 * spaced hour marks, always ending exactly at `capHours` hours after the earliest a claim could be
 * ready (baseClaimGapHours() -- this is the item's own generic description, not tied to any one
 * member's gear, so it assumes no sloth-style gear stretching that wait). Empty when there's
 * nothing to climb (`strength` 0 or less) or `capHours` isn't positive.
 */
export function stonksCurvePoints(strength: number, capHours: number): { hours: number; multiplier: number }[] {
  const cap = 1 + Math.max(0, strength);
  if (!(cap > 1) || !(capHours > 0)) return [];
  const count = Math.min(5, Math.max(1, Math.round(capHours)));
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 1) / count;
    return { hours: baseClaimGapHours() + t * capHours, multiplier: 1 + (cap - 1) * smoothstep(t) };
  });
}

/** Points after STONKS!, rounded, and at least 1 if it multiplied a real claim. A no-op at 1x. */
export function applyStonks(amount: number, multiplier: number): number {
  if (amount <= 0 || multiplier === 1) return amount;
  return Math.max(1, Math.round(amount * multiplier));
}

const text = (value: string): string =>
  `Stackosaurus: your claim multiplier climbs the longer you go without claiming, up to +${value}`;

export const stackosaurus = definePerk({
  description:
    "The claim multiplier the wearer's next claim reaches once enough hours have passed since their earliest possible reclaim, as an added percent (100% is a cap of 2x). Climbs on a smooth ease-in-out curve, not a jump, and stops growing at the cap (stonks.capHours).",
  defaults: { 1: 1, 2: 3, 3: 5, 4: 6.5 },
  min: 0,
  max: 99,
  text,
  /**
   * The line a player actually sees: at most 5 hour marks along the curve in multiplier form, read
   * live off `stonks.capHours` so the line always matches what the perk really does.
   */
  line(strength, settings) {
    const points = stonksCurvePoints(strength, settings.stonks.capHours);
    if (points.length === 0) return text(formatPercent(strength));
    const parts = points.map(({ hours, multiplier }) => `${formatMultiplier(multiplier)} at ${Number(hours.toFixed(1))}h`);
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] as string);
    return `Stackosaurus: your claim multiplier starts at 1x once your claim is ready and climbs the longer you wait after that, reaching ${list} (the cap).`;
  },
});
