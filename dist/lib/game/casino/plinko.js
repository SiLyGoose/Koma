import { PLINKO_ROWS } from '../../../constants/index.js';
/** How many slots the board has. */
export const slotCount = (rows = PLINKO_ROWS) => rows + 1;
/** Drops a ball: `goesRight` says which way it bounces at each row (a fair coin in the real game). */
export function rollPath(goesRight, rows = PLINKO_ROWS) {
    return Array.from({ length: rows }, () => goesRight());
}
/** The slot a ball ends in, counted from the left starting at 0: how many times it bounced right. */
export const slotOf = (path) => path.filter(Boolean).length;
/** The payout multiplier of one slot (0 up to `rows`), from the mirrored settings. */
export function slotMultiplier(payout, slot, rows = PLINKO_ROWS) {
    if (!Number.isInteger(slot) || slot < 0 || slot > rows)
        throw new Error(`There is no slot ${slot} on a board with ${rows} rows`);
    const multiplier = payout[Math.min(slot, rows - slot) + 1];
    if (typeof multiplier !== 'number')
        throw new Error(`No payout is set for slot ${slot}`);
    return multiplier;
}
/** The payout multiplier of every slot, left to right. */
export function slotMultipliers(payout, rows = PLINKO_ROWS) {
    return Array.from({ length: slotCount(rows) }, (_, slot) => slotMultiplier(payout, slot, rows));
}
/** What a bet pays at a multiplier, in whole points (rounded to the nearest). */
export const payoutFor = (bet, multiplier) => Math.round(bet * multiplier);
/** "n choose k". */
function choose(n, k) {
    let result = 1;
    for (let i = 1; i <= k; i++)
        result = (result * (n - k + i)) / i;
    return Math.round(result);
}
/** The chance a ball ends in each slot, left to right (they add up to 1). */
export function slotChances(rows = PLINKO_ROWS) {
    const total = 2 ** rows;
    return Array.from({ length: slotCount(rows) }, (_, slot) => choose(rows, slot) / total);
}
/**
 * What a bet is paid back on average, as a fraction of the bet: 1 breaks even over many games,
 * below 1 means the house wins in the long run.
 */
export function expectedReturn(payout, rows = PLINKO_ROWS) {
    const chances = slotChances(rows);
    return chances.reduce((sum, chance, slot) => sum + chance * slotMultiplier(payout, slot, rows), 0);
}
/**
 * How far right of the middle the ball is after `frame` bounces, in slot widths (negative is left):
 * the bounces to the right minus half the bounces so far. After all the rows this is the middle
 * of the slot it landed in.
 */
export function ballOffset(path, frame) {
    if (!Number.isInteger(frame) || frame < 0 || frame > path.length)
        throw new Error(`The ball has no frame ${frame}`);
    let rights = 0;
    for (let i = 0; i < frame; i++)
        if (path[i])
            rights++;
    return rights - frame / 2;
}
//# sourceMappingURL=plinko.js.map