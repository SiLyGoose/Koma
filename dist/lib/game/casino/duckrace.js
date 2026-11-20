import { randomInt } from 'node:crypto';
import { DUCK_IDS, DUCK_RACE_MARKS } from '../../../constants/index.js';
import { parseSpotBets, returnAt, sumBets } from './table-bets.js';
/** Each leg takes 0.7 to 1.3 of an even pace. */
const LEG_LEAST = 0.7;
const LEG_SPREAD = 600;
/** The least each duck home finishes behind the one before it (in even legs), so nobody ties. */
const LEAST_GAP = 0.05;
export const isDuck = (spot) => DUCK_IDS.includes(spot);
/** The ducks in a random order (Fisher-Yates). */
function shuffled(pick) {
    const ducks = [...DUCK_IDS];
    for (let i = ducks.length - 1; i > 0; i--) {
        const j = pick(i + 1);
        [ducks[i], ducks[j]] = [ducks[j], ducks[i]];
    }
    return ducks;
}
/** One duck's run: the time at each mark, in even legs. */
function run(pick) {
    let at = 0;
    return Array.from({ length: DUCK_RACE_MARKS }, () => (at += LEG_LEAST + pick(LEG_SPREAD + 1) / 1000));
}
const round3 = (n) => Math.round(n * 1000) / 1000;
/** Runs a race. `pick` gives a whole number from 0 up to (not including) its argument (the real game uses a secure random source). */
export function race(pick = (max) => randomInt(0, max)) {
    const order = shuffled(pick);
    // The runs, fastest first: the fastest is the winner's, the next the second duck home's, and so on.
    const runs = order.map(() => run(pick)).sort((a, b) => a.at(-1) - b.at(-1));
    // Nobody ties: one too close behind the one before is slowed down to just behind them.
    for (let i = 1; i < runs.length; i++) {
        const ahead = runs[i - 1].at(-1);
        const time = runs[i].at(-1);
        if (time < ahead + LEAST_GAP)
            runs[i] = runs[i].map((t) => (t * (ahead + LEAST_GAP)) / time);
    }
    const last = runs.at(-1).at(-1);
    const splits = {};
    order.forEach((duck, i) => (splits[duck] = runs[i].map((t) => round3(t / last))));
    return { winner: order[0], order, splits };
}
/** Settles every bet on the table (in the order they are in, only the ones with points on): the winner's pay `payout` to 1. */
export function settleBets(bets, round, payout) {
    return Object.entries(bets)
        .filter(([, amount]) => (amount ?? 0) > 0)
        .map(([spot, amount]) => {
        const outcome = spot === round.winner ? 'win' : 'lose';
        return { spot, amount: amount, outcome, returned: returnAt(amount, payout, outcome) };
    });
}
/** The points on the table. */
export const totalBet = (bets) => sumBets(bets);
/** Reads bets from the page (see parseSpotBets): null when a spot isn't a duck, or a bet isn't a whole number from 0 up. */
export const parseBets = (data) => parseSpotBets(data, isDuck);
//# sourceMappingURL=duckrace.js.map