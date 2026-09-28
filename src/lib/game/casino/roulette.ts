import { randomInt } from 'node:crypto';
import { ROULETTE_OUTSIDE, ROULETTE_RED, type RouletteOutside } from '../../../constants/index.js';
import { parseSpotBets, returnAt, sumBets, type SettledBet, type SpotBets } from './table-bets.js';

/*
 * The rules of roulette (American: 0 and 00), with no database and no pictures.
 *
 * The wheel has 38 pockets, 0, 00 and 1 to 36; 0 and 00 are green, and of 1 to 36 half are red and
 * half black. Each round the ball lands in one. A bet covers some of the pockets, and wins when the
 * ball lands in one of them, paying 36 / (how many it covers) - 1 to 1, rounded down; otherwise it's
 * lost (on 0 and 00 too, for every bet that doesn't cover them). So the house keeps 2/38 (5.26%) of
 * every bet, and 3/38 of the top line's (which pays 6 to 1 for five pockets).
 *
 * The spots a bet can go on:
 *  - Inside, named by the numbers they cover, smallest first, joined with "-": a straight ("17", 35
 *    to 1), a split of two numbers side by side on the board ("17-20", 17 to 1), a street of a row
 *    of three ("16-17-18", 11 to 1), a corner of four ("16-17-19-20", 8 to 1) and a line of two
 *    streets ("13-14-15-16-17-18", 5 to 1). 0 comes first and 00 next: the zeros split with each
 *    other ("0-00"), 0 with 1 and 00 with 3, make the streets 0-1-2, 0-00-2 and 00-2-3, and the top
 *    line "0-00-1-2-3".
 *  - Outside (ROULETTE_OUTSIDE): red or black, odd or even, low (1-18) or high (19-36), which pay
 *    1 to 1; a dozen (1-12, 13-24, 25-36) or a column, which pay 2 to 1.
 *
 * The board lays the numbers out in 12 rows of three across (1 2 3, 4 5 6, ... 34 35 36), and the
 * columns are down it: column 1 is 1, 4, 7, ... 34.
 */

export type RouletteColor = 'red' | 'black' | 'green';

/** A pocket on the wheel: 0 to 36, or 00. */
export type RoulettePocket = number | '00';

export interface RouletteRound {
  /** Where the ball landed. */
  number: RoulettePocket;
  color: RouletteColor;
}

/** A spot's name: an outside bet, or the numbers an inside bet covers (see above). */
export type RouletteSpot = string;
export type RouletteBets = SpotBets<RouletteSpot>;

export const colorOf = (n: RoulettePocket): RouletteColor => (n === 0 || n === '00' ? 'green' : ROULETTE_RED.includes(n) ? 'red' : 'black');

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** The numbers an outside bet covers. */
function outsideNumbers(spot: RouletteOutside): number[] {
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
export const ROULETTE_SPOTS: ReadonlyMap<RouletteSpot, readonly RoulettePocket[]> = (() => {
  const spots = new Map<RouletteSpot, RoulettePocket[]>();
  const add = (numbers: RoulettePocket[]): void => void spots.set(numbers.join('-'), numbers);
  add(['00']);
  for (let n = 0; n <= 36; n++) add([n]);
  for (let n = 1; n <= 36; n++) {
    const inRow = (n - 1) % 3; // 0, 1 or 2 across the row
    if (inRow < 2) add([n, n + 1]); // split across
    if (n <= 33) add([n, n + 3]); // split down
    if (inRow === 0) add([n, n + 1, n + 2]); // street
    if (inRow < 2 && n <= 32) add([n, n + 1, n + 3, n + 4]); // corner
    if (inRow === 0 && n <= 31) add(range(n, n + 5)); // line
  }
  const zeros: RoulettePocket[][] = [[0, '00'], [0, 1], ['00', 3], [0, 1, 2], [0, '00', 2], ['00', 2, 3], [0, '00', 1, 2, 3]];
  for (const numbers of zeros) add(numbers);
  for (const spot of ROULETTE_OUTSIDE) spots.set(spot, outsideNumbers(spot));
  return spots;
})();

export const isRouletteSpot = (spot: string): spot is RouletteSpot => ROULETTE_SPOTS.has(spot);

/** What a winning bet on `spot` pays, to 1: 36 over how many pockets it covers, less the bet (rounded down: the top line's 5 pay 6). */
export const oddsFor = (spot: RouletteSpot): number => Math.floor(36 / (ROULETTE_SPOTS.get(spot)?.length ?? 36) - 1);

/** Spins the wheel. `pick` gives a whole number from 0 up to (not including) its argument (the real game uses a secure random source). */
export function spin(pick: (max: number) => number = (max) => randomInt(0, max)): RouletteRound {
  const drawn = pick(38);
  const number: RoulettePocket = drawn === 37 ? '00' : drawn;
  return { number, color: colorOf(number) };
}

/** Settles every bet on the table (in the order they are in, only the ones with points on). */
export function settleBets(bets: RouletteBets, round: RouletteRound): SettledBet<RouletteSpot>[] {
  return Object.entries(bets)
    .filter(([, amount]) => (amount ?? 0) > 0)
    .map(([spot, amount]) => {
      const outcome = ROULETTE_SPOTS.get(spot)?.includes(round.number) ? 'win' : 'lose';
      return { spot, amount: amount as number, outcome, returned: returnAt(amount as number, oddsFor(spot), outcome) };
    });
}

/** The points on the table. */
export const totalBet = (bets: RouletteBets): number => sumBets(bets);

/** Reads bets from the page (see parseSpotBets): null when a spot isn't a roulette one, or a bet isn't a whole number from 0 up. */
export const parseBets = (data: unknown): RouletteBets | null => parseSpotBets(data, isRouletteSpot);
