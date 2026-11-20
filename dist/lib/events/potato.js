import { randomInt } from 'node:crypto';
/** How many potatoes go off: `wanted` (the setting), but never so many that nobody is left (one fewer than the players). */
export function potatoBlasts(wanted, players) {
    return Math.max(0, Math.min(Math.floor(wanted), players - 1));
}
/** A fuse from `minSeconds` to `maxSeconds` long, in whole milliseconds. `rand` (min and max inclusive) is injectable for tests. */
export function rollFuseMs(minSeconds, maxSeconds, rand = (min, max) => randomInt(min, max + 1)) {
    const min = Math.round(Math.min(minSeconds, maxSeconds) * 1000);
    const max = Math.round(Math.max(minSeconds, maxSeconds) * 1000);
    return rand(min, max);
}
export const playersIn = (state) => state.players.filter((player) => !player.out);
/** Hands a new potato to someone still in, at random (`pick` gives a number below what it's given; injectable for tests). Returns who. */
export function servePotato(state, pick = (n) => randomInt(n)) {
    const left = playersIn(state);
    state.holder = left.length > 0 ? left[pick(left.length)].userId : null;
    return state.holder;
}
/**
 * `userId` pressed Pass. The holder tosses it to another player still in: `to`, when they picked one who is (the site
 * lets them), otherwise one at random. Anyone else still in grabs it, whoever they picked. Decided at once, so two
 * presses can never both move the same potato.
 */
export function pressPass(state, userId, pick = (n) => randomInt(n), to) {
    const player = state.players.find((p) => p.userId === userId);
    if (!player)
        return { kind: 'notPlaying' };
    if (player.out)
        return { kind: 'out' };
    if (state.holder === null)
        return { kind: 'noPotato' };
    if (state.holder !== userId) {
        const from = state.holder;
        state.holder = userId;
        return { kind: 'grabbed', from };
    }
    const others = playersIn(state).filter((p) => p.userId !== userId);
    // Only the holder is left (can't happen while potatoes still go off, but never toss it to nobody).
    if (others.length === 0)
        return { kind: 'passed', to: userId };
    const picked = others.find((p) => p.userId === to) ?? others[pick(others.length)];
    player.passes++;
    state.holder = picked.userId;
    return { kind: 'passed', to: picked.userId };
}
/** Adds `move` to the end of `trail`, keeping only its last `keep`. */
export function addMove(trail, move, keep) {
    trail.push(move);
    if (trail.length > keep)
        trail.splice(0, trail.length - keep);
}
/** The fuse of potato `blast` burned out: whoever holds it is out. Returns them (null if nobody held it). */
export function blowUp(state, blast) {
    const holder = state.holder;
    state.holder = null;
    const player = state.players.find((p) => p.userId === holder);
    if (!player)
        return null;
    player.out = true;
    player.blastedBy = blast;
    return player.userId;
}
//# sourceMappingURL=potato.js.map