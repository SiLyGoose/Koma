/*
 * The D20's die and its animation. The perk itself is in perks/d20/.
 */

/** File name of the die picture attached to a claim or rob that rolled the D20. */
export const D20_IMAGE_NAME = 'd20.png';

/**
 * How the D20 animation plays, like WHEEL_ANIMATION: the reply first shows the die tumbling, the
 * picture is swapped every `frameMs` milliseconds (the die slowing down and showing other numbers)
 * for `minSeconds` to `maxSeconds`, and then it lands on the real roll. Keep `frameMs` at 500 or more.
 */
export const D20_ANIMATION = { frameMs: 1000, minSeconds: 3, maxSeconds: 5 };

/**
 * What a roll of the D20 (the `d20` effect, on the D20 item) does to a claim or a rob. The die is
 * rolled first, before anything else is decided. On a 1 or on `sides`, a second die with `bonusSides`
 * sides is rolled too. A roll of 1 is a critical fail: the claim pays nothing (the hour is used up)
 * and the member pays the vault what it would have paid times the second die, or the rob is caught
 * and its fine is multiplied by the second die. A roll of `sides` is a critical success: the rob
 * always gets through, and the claim or what the rob takes is multiplied by the second die. Any roll in between scales things by roll / `divisor` (with
 * 10, a 2 is 0.2x, a 10 is 1x and a 19 is 1.9x): the claim's amount, or the rob's success chance.
 */
export const D20 = { sides: 20, bonusSides: 3, divisor: 10 };
