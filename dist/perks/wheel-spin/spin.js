import { WHEEL_MIN_CHANCE } from '../../constants/index.js';
import { randomUnit } from '../../lib/random.js';
import { refineShare } from '../../lib/game/items/refine-share.js';
import { clamp } from '../define.js';
import { WHEEL_SLICES } from './slices.js';
/**
 * The chance (0 to 1) that the wheel spins, from the wheelSpin strength the wearer's gear adds up
 * to (the setting, times the worn copy's refine share, times how much of it they get). The lowest
 * refine level spins WHEEL_MIN_CHANCE of the time and full strength always does; the levels in
 * between climb with the refine share. Weaker than R1 (a borrowed one) falls below the minimum.
 */
export function wheelSpinChance(strength) {
    if (!(strength > 0))
        return 0;
    const lowest = refineShare(1);
    if (lowest >= 1)
        return clamp(strength, 0, 1);
    return clamp(WHEEL_MIN_CHANCE + ((1 - WHEEL_MIN_CHANCE) * (strength - lowest)) / (1 - lowest), 0, 1);
}
export function rollWheelDice() {
    return { trigger: randomUnit(), slice: randomUnit(), offset: randomUnit() };
}
/**
 * Spins the wheel: it spins with probability `strength` (0 to 1), and every slice is equally
 * likely. Returns null when it doesn't spin. Taking the dice as input keeps this exact and
 * testable, and lets a caller that has to retry keep the same spin.
 */
export function spinWheel(strength, dice, slices = WHEEL_SLICES) {
    if (!(strength > 0) || dice.trigger >= Math.min(1, strength) || slices.length === 0)
        return null;
    const index = Math.min(slices.length - 1, Math.floor(dice.slice * slices.length));
    // Keep the pointer off the slice edges so the picture is never ambiguous.
    return { index, multiplier: slices[index], offset: 0.1 + 0.8 * dice.offset, slices };
}
/** Points after the wheel's multiplier, rounded, and at least 1. */
export function applyWheel(amount, multiplier) {
    return Math.max(1, Math.round(amount * multiplier));
}
//# sourceMappingURL=spin.js.map