import { MAX_WHEEL_MULTIPLIER, MAX_WHEEL_SLICES } from '../../constants/index.js';

/**
 * The shape of the prize wheel that the Wheelchair (any item with the wheelSpin effect) spins when
 * its wearer claims or robs successfully. Each number is one slice: the multiplier the points are
 * multiplied by if the wheel lands there. The wheel actually spun is `wheelSlices`: these, with the
 * winning slices stretched so the biggest is the wheel.maxMultiplier setting. Every slice is equally likely, and the wheel picture
 * draws them clockwise from the top in this order.
 *
 * Add up the slices and divide by how many there are to get the average: 1.0x means the wheel
 * neither helps nor hurts in the long run and only adds swing, below 1.0x it costs the wearer
 * points on average, and above 1.0x it pays. As written these average 1.0x; stretched to the
 * default 5x they average about 1.47x. Keep 2 to 16 slices; a slice smaller than 1 shrinks
 * the points, bigger than 1 grows them.
 *
 * How often the wheel spins at all is the wheelSpin effect's setting (equipment.wheelSpin.<stars>).
 */
export const WHEEL_SLICES: readonly number[] = [1, 0.1, 1.5, 0.4, 2.5, 0.75, 1.25, 0.5] as const;

/**
 * The wheel as it is spun: the slices above, with every slice over 1x stretched away from 1x so the
 * biggest one lands on `maxMultiplier` (the wheel.maxMultiplier setting). Slices of 1x or less are
 * left alone. Rounded to hundredths, so the picture and the reply show exactly what is paid.
 */
export function wheelSlices(maxMultiplier: number, slices: readonly number[] = WHEEL_SLICES): number[] {
  const top = Math.max(...slices);
  if (!(top > 1)) return [...slices];
  const stretch = (Math.max(1, maxMultiplier) - 1) / (top - 1);
  return slices.map((slice) => (slice > 1 ? Number((1 + (slice - 1) * stretch).toFixed(2)) : slice));
}

/** Throws at startup if the wheel would break the game or could not be drawn. */
export function validateWheel(slices: readonly number[] = WHEEL_SLICES): void {
  if (slices.length < 2 || slices.length > MAX_WHEEL_SLICES) {
    throw new Error(`The wheel needs 2 to ${MAX_WHEEL_SLICES} slices (it has ${slices.length}).`);
  }
  for (const slice of slices) {
    if (!Number.isFinite(slice) || slice <= 0 || slice > MAX_WHEEL_MULTIPLIER) {
      throw new Error(`Every wheel slice must be more than 0 and at most ${MAX_WHEEL_MULTIPLIER} (found ${slice}).`);
    }
  }
}
