import { randomInt } from 'node:crypto';
import { LASER } from '../../constants/index.js';
/** A duck in `ms`: kept as the player's best if it is, and added to their total. */
export function recordDuck(player, ms) {
    player.bestMs = player.bestMs === null ? ms : Math.min(player.bestMs, ms);
    player.totalMs += ms;
}
/** Those never caught, fastest first: the least time ducking in all, then the fastest single duck, then (a tie) by id, so the order is always the same. */
export function rankWinners(players) {
    return players.filter(isIn).sort((a, b) => a.totalMs - b.totalMs || (a.bestMs ?? Infinity) - (b.bestMs ?? Infinity) || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
}
/**
 * Splits `prize` between `ranked` (first place first) by place: with n winners, first gets n parts, second n - 1, and so
 * on to 1 for the last (3 winners: half, a third and a sixth). Rounded down, the few points that leaves going one each
 * from first place on, so the shares add up to exactly the prize and never go out of order.
 */
export function rankedSplit(prize, ranked) {
    const n = ranked.length;
    if (n === 0 || !(prize > 0))
        return ranked.map((userId) => ({ userId, amount: 0 }));
    const parts = (n * (n + 1)) / 2;
    const shares = ranked.map((userId, i) => ({ userId, amount: Math.floor((prize * (n - i)) / parts) }));
    let left = prize - shares.reduce((sum, share) => sum + share.amount, 0);
    for (let i = 0; left > 0; i = (i + 1) % n, left--)
        shares[i].amount++;
    return shares;
}
export const isIn = (player) => player.caughtFor === null;
/** A slot button's id: which round and phase it was shown in, and which slot it is. */
export const slotId = (round, phase, slot) => `${LASER.slotPrefix}:${round}:${phase}:${slot}`;
/** The round, phase and slot of a slot button's id, or null if it isn't one. */
export function parseSlotId(id) {
    const match = new RegExp(`^${LASER.slotPrefix}:(\\d+):(wait|go):(\\d+)$`).exec(id);
    if (!match)
        return null;
    return { round: Number(match[1]), phase: match[2], slot: Number(match[3]) };
}
/**
 * How long round `round` (1 to `rounds`) gives to duck, in milliseconds: `startSeconds` in the
 * first round, shrinking evenly to `endSeconds` in the last.
 */
export function laserWindowMs(round, rounds, startSeconds, endSeconds) {
    const progress = rounds > 1 ? Math.min(1, Math.max(0, (round - 1) / (rounds - 1))) : 0;
    return Math.round((startSeconds + (endSeconds - startSeconds) * progress) * 1000);
}
/**
 * The fake ducks of a round: green like Duck! but saying something else (a word from `labels`), on `count` of the slots
 * that aren't `duckSlot` (fewer if there aren't that many, always leaving one laser). Pressing one is a wrong button.
 * `pick` gives a number below what it's given (injectable for tests). Returns each one's slot and word.
 */
export function rollDecoys(slots, duckSlot, count, labels, pick = (n) => randomInt(n)) {
    const free = Array.from({ length: slots }, (_, slot) => slot).filter((slot) => slot !== duckSlot);
    const decoys = new Map();
    const wanted = Math.max(0, Math.min(Math.floor(count), free.length - 1));
    if (labels.length === 0)
        return decoys;
    while (decoys.size < wanted) {
        const slot = free.splice(pick(free.length), 1)[0];
        decoys.set(slot, labels[pick(labels.length)]);
    }
    return decoys;
}
/** How many fake ducks round `round` has: none in the first (to learn the game on), then from 0 to `most`. `rand` (both ends inclusive) is injectable for tests. */
export function decoyCount(round, most, rand = (min, max) => randomInt(min, max + 1)) {
    return round <= 1 || most <= 0 ? 0 : rand(0, most);
}
/**
 * What one press does: a `wait` button is pressed too early, a `go` button that isn't `duckSlot`
 * is the wrong one, and the right one pressed after `deadlineMs` is too late.
 */
export function judgePress(phase, slot, duckSlot, nowMs, deadlineMs) {
    if (phase === 'wait')
        return 'early';
    if (slot !== duckSlot)
        return 'wrong';
    return nowMs > deadlineMs ? 'late' : 'ducked';
}
/**
 * Ends round `round`: everyone still in who didn't duck (in `results`, a player's first press of the
 * round) is caught, those who never pressed for being too late. Returns who was caught.
 */
export function settleRound(players, results, round) {
    const caught = [];
    for (const player of players) {
        if (!isIn(player))
            continue;
        const result = results.get(player.userId) ?? 'late';
        if (result === 'ducked')
            continue;
        player.caughtFor = result;
        player.caughtRound = round;
        caught.push(player);
    }
    return caught;
}
//# sourceMappingURL=laser.js.map