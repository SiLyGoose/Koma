/*
 * What every shared-table game (baccarat, roulette) does with chips on its spots, with no database:
 * reading them from the page, adding them up, and what a round's bets gave back and lost.
 */
/** The points on the table. */
export const sumBets = (bets) => Object.values(bets).reduce((sum, amount) => sum + Math.max(0, amount ?? 0), 0);
/** What a bet of `amount` at `odds` to 1 gives back (the bet included): the bet times 1 + its odds on a win, the bet on a push, 0 on a loss. */
export function returnAt(amount, odds, outcome) {
    if (outcome === 'lose')
        return 0;
    if (outcome === 'push')
        return amount;
    return Math.floor(amount * (1 + odds) + 1e-9);
}
/**
 * The points lost on losing bets, each counted on its own: a side bet that loses is lost even when
 * the bet beside it wins. What goes into the vault (pushes and wins give their chips back).
 */
export const lostChips = (settled) => settled.reduce((sum, b) => sum + (b.outcome === 'lose' ? b.amount : 0), 0);
/**
 * Reads bets from the page: an object of spot to whole points. Null when it isn't one (a spot
 * `isSpot` doesn't know, or a bet that isn't a whole number from 0 up). Spots at 0 are left out, so
 * `{}` is no bets.
 */
export function parseSpotBets(data, isSpot) {
    if (typeof data !== 'object' || data === null || Array.isArray(data))
        return null;
    const bets = {};
    for (const [spot, amount] of Object.entries(data)) {
        if (!isSpot(spot))
            return null;
        if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0)
            return null;
        if (amount > 0)
            bets[spot] = amount;
    }
    return bets;
}
//# sourceMappingURL=table-bets.js.map