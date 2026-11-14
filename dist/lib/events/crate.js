import { randomInt } from 'node:crypto';
import { randInt } from '../random.js';
/**
 * Which third of the range from `min` to `max` the pile is in: the lowest third is `low`, the
 * middle third `mid` and the top third `high`. A crate that can only ever hold one amount is `low`.
 */
export function crateTier(pile, min, max) {
    if (!(max > min))
        return 'low';
    const above = (pile - min) * 3;
    if (above >= 2 * (max - min))
        return 'high';
    return above >= max - min ? 'mid' : 'low';
}
/** How many points a new crate holds: a random whole number from `min` to `max`, inclusive. */
export function rollPile(min, max, rand = randInt) {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 1 || max < min) {
        throw new Error(`A crate needs a pile between two whole numbers, 1 or more (got ${min} to ${max})`);
    }
    return rand(min, max);
}
/**
 * Splits `pile` between `userIds` (each one once, in the order given). Everyone gets the pile
 * divided by the number of people, rounded down, and the points left over (fewer than the number
 * of people) go one each to members picked at random, so the shares add up to exactly `pile`
 * and nobody's share differs from anyone else's by more than 1. `pick(n)` chooses a whole number
 * from 0 up to but not including n (injectable so this can be tested).
 */
export function splitPile(pile, userIds, pick = (n) => randomInt(n)) {
    if (!Number.isSafeInteger(pile) || pile < 0)
        throw new Error(`A pile must be a whole number of points, got ${pile}`);
    if (new Set(userIds).size !== userIds.length)
        throw new Error('Each member can only be in the split once');
    if (userIds.length === 0)
        return [];
    const each = Math.floor(pile / userIds.length);
    let extra = pile - each * userIds.length;
    const shares = userIds.map((userId) => ({ userId, amount: each }));
    // Give the leftover points one at a time to members chosen at random, never the same one twice.
    const waiting = shares.map((_, index) => index);
    while (extra > 0) {
        const [chosen] = waiting.splice(pick(waiting.length), 1);
        shares[chosen].amount += 1;
        extra--;
    }
    return shares;
}
//# sourceMappingURL=crate.js.map