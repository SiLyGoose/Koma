import { mix, type Rgb } from './raster.js';

/*
 * Colors for the numbers in a picture (the plinko slots and the D20's faces; the wheel keeps its
 * own fixed colors, see sliceColor in wheel-image.ts). They depend on the whole set of numbers
 * being drawn, not on each number alone: the biggest one is gold, the smallest is red, and the
 * ones in between blend from red through orange to gold. `reversed` flips that, so the biggest
 * is red and the smallest gold. So whatever the numbers are set to, the picture always uses the
 * full range of colors.
 */

const RED: Rgb = [220, 70, 75];
const ORANGE: Rgb = [235, 140, 60];
const GOLD: Rgb = [245, 197, 66];

/** The color at `t` (0 is the smallest number's red, 1 is the biggest number's gold), in whole color values. */
export function gradientColor(t: number): Rgb {
  const at = Math.min(1, Math.max(0, t));
  const [r, g, b] = at < 0.5 ? mix(RED, ORANGE, at * 2) : mix(ORANGE, GOLD, (at - 0.5) * 2);
  return [Math.round(r), Math.round(g), Math.round(b)];
}

export interface RangeOptions {
  /** Biggest number red and smallest gold, instead of the other way round. */
  reversed?: boolean;
}

/**
 * A color for each of `values` (multipliers), in the same order. Where a number sits between the
 * smallest and biggest is measured as a ratio, not a difference, because a multiplier of 0.5 is
 * as far below 1 as 2 is above it; measured by difference, one huge number would turn every other
 * one red. A number that is 0 (or less) counts as half the smallest positive number, so it is
 * still at the very bottom of the range and different from the next one up. If every number is
 * the same there is no range, so they all get the middle color.
 */
export function rangeColors(values: readonly number[], { reversed = false }: RangeOptions = {}): Rgb[] {
  const colorAt = (t: number): Rgb => gradientColor(reversed ? 1 - t : t);
  const positive = values.filter((value) => value > 0);
  if (positive.length === 0) return values.map(() => colorAt(0.5));

  const highest = Math.max(...positive);
  const smallest = Math.min(...positive);
  const lowest = positive.length < values.length ? smallest / 2 : smallest;
  if (highest === lowest) return values.map(() => colorAt(0.5));

  const span = Math.log(highest / lowest);
  return values.map((value) => colorAt(value > 0 ? Math.log(value / lowest) / span : 0));
}
