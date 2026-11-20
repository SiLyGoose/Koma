import { splitPile } from './crate.js';
/** The choice that counts for `userId`: what they picked, or Split if they picked nothing. */
export function choiceOf(choices, userId) {
    return choices.get(userId) ?? 'split';
}
/** Who gets what, from everyone's choices. `players` is everyone who joined, each once. `pick` is injectable for tests. */
export function resolveSplitSteal(prize, players, choices, pick) {
    const stealers = players.filter((userId) => choiceOf(choices, userId) === 'steal');
    if (stealers.length === 0)
        return { kind: 'shared', shares: splitPile(prize, players, pick) };
    if (stealers.length === 1) {
        const thief = stealers[0];
        return { kind: 'stolen', thief, shares: [{ userId: thief, amount: prize }] };
    }
    return { kind: 'greed', stealers, shares: [] };
}
//# sourceMappingURL=split-steal.js.map