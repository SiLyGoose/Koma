import { D20 } from '../../constants/index.js';
import { randomUnit } from '../../lib/random.js';
export function rollD20Dice() {
    return { trigger: randomUnit(), face: randomUnit(), bonus: randomUnit() };
}
export function d20Kind(roll) {
    if (roll <= 1)
        return 'fail';
    if (roll >= D20.sides)
        return 'success';
    return 'normal';
}
/** How much a roll between the extremes scales the claim or the rob chance: roll / D20.divisor (0 for a fail). */
export function d20Scale(roll) {
    return d20Kind(roll) === 'fail' ? 0 : roll / D20.divisor;
}
/**
 * Rolls the die: it rolls with probability `strength` (0 to 1) and every number is equally likely;
 * on a critical fail or success the bonus die is rolled too. Returns null when it doesn't roll. Taking the
 * dice as input keeps this exact and testable, and lets a caller that has to retry keep the same roll.
 */
export function rollD20(strength, dice) {
    if (!(strength > 0) || dice.trigger >= Math.min(1, strength))
        return null;
    const roll = Math.min(D20.sides, 1 + Math.floor(dice.face * D20.sides));
    const kind = d20Kind(roll);
    const bonus = kind === 'normal' ? null : Math.min(D20.bonusSides, 1 + Math.floor(dice.bonus * D20.bonusSides));
    return { roll, kind, bonus, multiplier: kind === 'success' ? bonus : d20Scale(roll) };
}
/**
 * Claim points after the die: nothing for a critical fail, otherwise the multiplied amount, rounded,
 * and at least 1 (a low roll on a small claim never rounds down to nothing).
 */
export function applyD20(amount, d20) {
    if (d20.kind === 'fail')
        return 0;
    return Math.max(1, Math.round(amount * d20.multiplier));
}
/**
 * What a critical fail costs on top of losing the claim or being caught: `base` (what the claim
 * would have paid, or the rob's fine) times the bonus die. 0 on any other roll.
 */
export function d20Penalty(base, d20) {
    return d20?.kind === 'fail' && d20.bonus !== null ? Math.max(0, Math.round(base * d20.bonus)) : 0;
}
/** A rob's success chance after the die: 0 on a fail, 1 on a success, otherwise scaled by the roll (held to 0 to 1). */
export function d20RobChance(chance, d20) {
    if (d20.kind === 'fail')
        return 0;
    if (d20.kind === 'success')
        return 1;
    return Math.min(1, Math.max(0, chance * d20.multiplier));
}
/** What a successful rob takes after the die: multiplied by the bonus die on a critical success, unchanged otherwise. */
export function d20RobTake(amount, d20) {
    return d20?.kind === 'success' ? Math.round(amount * d20.multiplier) : amount;
}
//# sourceMappingURL=roll.js.map