import { randomInt } from 'node:crypto';
import { ROULETTE_OUTSIDE, ROULETTE_RED } from '../../../constants/index.js';
import { parseSpotBets, returnAt, sumBets } from './table-bets.js';
export const colorOf = (n) => (n === 0 || n === '00' ? 'green' : ROULETTE_RED.includes(n) ? 'red' : 'black');
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
/** The numbers an outside bet covers. */
function outsideNumbers(spot) {
    const all = range(1, 36);
    switch (spot) {
        case 'red':
        case 'black':
            return all.filter((n) => colorOf(n) === spot);
        case 'odd':
            return all.filter((n) => n % 2 === 1);
        case 'even':
            return all.filter((n) => n % 2 === 0);
        case 'low':
            return range(1, 18);
        case 'high':
            return range(19, 36);
        case 'dozen1':
        case 'dozen2':
        case 'dozen3': {
            const d = Number(spot.slice(-1)) - 1;
            return range(d * 12 + 1, d * 12 + 12);
        }
        case 'column1':
        case 'column2':
        case 'column3': {
            const c = Number(spot.slice(-1));
            return all.filter((n) => (n - c) % 3 === 0);
        }
    }
}
/** Every spot a bet can go on, and the numbers it covers. */
export const ROULETTE_SPOTS = (() => {
    const spots = new Map();
    const add = (numbers) => void spots.set(numbers.join('-'), numbers);
    add(['00']);
    for (let n = 0; n <= 36; n++)
        add([n]);
    for (let n = 1; n <= 36; n++) {
        const inRow = (n - 1) % 3; // 0, 1 or 2 across the row
        if (inRow < 2)
            add([n, n + 1]); // split across
        if (n <= 33)
            add([n, n + 3]); // split down
        if (inRow === 0)
            add([n, n + 1, n + 2]); // street
        if (inRow < 2 && n <= 32)
            add([n, n + 1, n + 3, n + 4]); // corner
        if (inRow === 0 && n <= 31)
            add(range(n, n + 5)); // line
    }
    const zeros = [[0, '00'], [0, 1], ['00', 3], [0, 1, 2], [0, '00', 2], ['00', 2, 3], [0, '00', 1, 2, 3]];
    for (const numbers of zeros)
        add(numbers);
    for (const spot of ROULETTE_OUTSIDE)
        spots.set(spot, outsideNumbers(spot));
    return spots;
})();
export const isRouletteSpot = (spot) => ROULETTE_SPOTS.has(spot);
/** What a winning bet on `spot` pays, to 1: 36 over how many pockets it covers, less the bet (rounded down: the top line's 5 pay 6). */
export const oddsFor = (spot) => Math.floor(36 / (ROULETTE_SPOTS.get(spot)?.length ?? 36) - 1);
/** Spins the wheel. `pick` gives a whole number from 0 up to (not including) its argument (the real game uses a secure random source). */
export function spin(pick = (max) => randomInt(0, max)) {
    const drawn = pick(38);
    const number = drawn === 37 ? '00' : drawn;
    return { number, color: colorOf(number) };
}
/** Settles every bet on the table (in the order they are in, only the ones with points on). */
export function settleBets(bets, round) {
    return Object.entries(bets)
        .filter(([, amount]) => (amount ?? 0) > 0)
        .map(([spot, amount]) => {
        const outcome = ROULETTE_SPOTS.get(spot)?.includes(round.number) ? 'win' : 'lose';
        return { spot, amount: amount, outcome, returned: returnAt(amount, oddsFor(spot), outcome) };
    });
}
/** The points on the table. */
export const totalBet = (bets) => sumBets(bets);
/** Reads bets from the page (see parseSpotBets): null when a spot isn't a roulette one, or a bet isn't a whole number from 0 up. */
export const parseBets = (data) => parseSpotBets(data, isRouletteSpot);
//# sourceMappingURL=roulette.js.map