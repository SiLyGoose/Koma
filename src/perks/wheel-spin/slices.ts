import { MAX_WHEEL_MULTIPLIER, MAX_WHEEL_SLICES } from '../../constants/index.js';

/**
 * The prize wheel that the Wheelchair (any item with the wheelSpin effect) spins when its wearer
 * claims or robs successfully. Each number is one slice: the multiplier the points are
 * multiplied by if the wheel lands there. Every slice is equally likely, and the wheel picture
 * draws them clockwise from the top in this order.
 *
 * Add up the slices and divide by how many there are to get the average: 1.0x means the wheel
 * neither helps nor hurts in the long run and only adds swing, below 1.0x it costs the wearer
 * points on average, and above 1.0x it pays. Keep 2 to 16 slices; a slice smaller than 1 shrinks
 * the points, bigger than 1 grows them.
 *
 * How often the wheel spins at all is the wheelSpin effect's setting (equipment.wheelSpin.<stars>).
 */
export const WHEEL_SLICES: readonly number[] = [1, 0.1, 1.5, 0.4, 2.5, 0.75, 1.25, 0.5] as const;

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
