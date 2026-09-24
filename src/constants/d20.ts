/*
 * The D20's die and its animation. The perk itself is in perks/d20/.
 */

/** File name of the die picture attached to a claim that rolled the D20. */
export const D20_IMAGE_NAME = 'd20.png';

/**
 * How the D20 animation plays, like WHEEL_ANIMATION: the reply first shows the die tumbling, the
 * picture is swapped every `frameMs` milliseconds (the die slowing down and showing other numbers)
 * for `minSeconds` to `maxSeconds`, and then it lands on the real roll. Keep `frameMs` at 500 or more.
 */
export const D20_ANIMATION = { frameMs: 1000, minSeconds: 3, maxSeconds: 5 };

/**
 * What a roll of the D20 (the `d20` effect, on the D20 item) does to a claim. A roll of 1 is a
 * critical fail: the claim pays nothing and the hour is used up. A roll of `sides` is a critical
 * success: it pays `critMultiplier` times as much and lets the member claim once more in the same
 * hour (and that extra claim rolls the die too). Any roll in between multiplies the claim by
 * roll / `divisor` (with 10, a 2 is 0.2x, a 10 is 1x and a 19 is 1.9x).
 */
export const D20 = { sides: 20, critMultiplier: 2, divisor: 10 };
