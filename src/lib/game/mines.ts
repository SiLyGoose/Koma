import { MINE_MINES, MINE_TILES } from '../../constants/index.js';
import { randInt } from '../random.js';

/*
 * The rules of the mine, with no database and no pictures, played like Stake's Mines. The board
 * has MINE_TILES tiles; the player picks how many of them are mines (MINE_MINES) and bets, then
 * turns tiles over one at a time, in any order:
 *
 *  - a gem raises the multiplier to the true odds of having turned over that many gems without a
 *    mine, less the house edge (so on average a round pays back 1 - edge, however far it goes);
 *  - a mine ends the round, and the bet is lost.
 *
 * The player can cash out any time after the first gem, for the bet times the multiplier. The round
 * cashes out by itself once every gem is turned over, or the multiplier reaches the cap. The house
 * edge depends on how many mines there are: `edgeFewest` with 1 mine, sliding evenly to `edgeMost`
 * with the most (so more mines pay a little better, like Stake's 24-mine board).
 */

/** The `mine` settings that shape a round. */
export interface MineRules {
  edgeFewest: number;
  edgeMost: number;
  maxMultiplier: number;
}

/** A round in the mine. Changed in place as it is played. */
export interface MineRun {
  /** How many mines are hidden on the board. */
  mines: number;
  /** Which tiles are mines, from the top left, row by row. */
  mine: boolean[];
  /** Which tiles have been turned over. */
  revealed: boolean[];
  /** Gems turned over so far. */
  gems: number;
  /** What a cash out pays now, as a multiple of the bet (1 before the first gem). */
  multiplier: number;
  /** 'boom' once a mine is turned over (the bet is lost); 'done' once every gem is, or the cap is reached. */
  status: 'playing' | 'boom' | 'done';
}

/** Random numbers the rules use (both ends included), so tests can choose them. */
export type MineRng = (min: number, max: number) => number;

/** Whether `mines` is a mine count a round can have. */
export const validMines = (mines: number): boolean => Number.isInteger(mines) && mines >= MINE_MINES.min && mines <= MINE_MINES.max;

/** The house edge with `mines` mines: edgeFewest with the fewest, sliding evenly to edgeMost with the most. */
export function houseEdge(rules: MineRules, mines: number): number {
  const span = MINE_MINES.max - MINE_MINES.min;
  const t = span > 0 ? (mines - MINE_MINES.min) / span : 1;
  return rules.edgeFewest + (rules.edgeMost - rules.edgeFewest) * t;
}

/**
 * The multiplier after `gems` gems on a board with `mines` mines: the true odds of turning over that
 * many gems in a row, less the house edge, rounded down to the hundredth and capped at maxMultiplier.
 * 1 before the first gem.
 */
export function multiplierFor(rules: MineRules, mines: number, gems: number): number {
  if (gems <= 0) return 1;
  let odds = 1;
  for (let i = 0; i < gems; i++) odds *= (MINE_TILES - i) / (MINE_TILES - mines - i);
  const paid = Math.floor((1 - houseEdge(rules, mines)) * odds * 100 + 1e-9) / 100;
  return Math.min(rules.maxMultiplier, paid);
}

/** Starts a round with `mines` mines hidden at random. */
export function startRun(mines: number, rng: MineRng = randInt): MineRun {
  if (!validMines(mines)) throw new Error(`A mine round can't have ${mines} mines`);
  const tiles = Array.from({ length: MINE_TILES }, (_, i) => i);
  // The first `mines` of a shuffle are the mines.
  for (let i = 0; i < mines; i++) {
    const j = rng(i, MINE_TILES - 1);
    [tiles[i], tiles[j]] = [tiles[j] as number, tiles[i] as number];
  }
  const mine = Array.from({ length: MINE_TILES }, () => false);
  for (const i of tiles.slice(0, mines)) mine[i] = true;
  return { mines, mine, revealed: mine.map(() => false), gems: 0, multiplier: 1, status: 'playing' };
}

/** What turning over a tile did. */
export type PickResult =
  /** Not a tile, or already turned over: nothing happened. */
  | { kind: 'taken' }
  /** A gem; `done` when that was the last gem, or the multiplier reached the cap (the round cashes out by itself). */
  | { kind: 'gem'; multiplier: number; done: 'cleared' | 'capped' | null }
  | { kind: 'boom' };

/** Turns over tile `index`. Throws once the round is over. */
export function pick(run: MineRun, index: number, rules: MineRules): PickResult {
  if (run.status !== 'playing') throw new Error('This round is over');
  if (!Number.isInteger(index) || index < 0 || index >= MINE_TILES || run.revealed[index]) return { kind: 'taken' };
  run.revealed[index] = true;
  if (run.mine[index]) {
    run.status = 'boom';
    return { kind: 'boom' };
  }
  run.gems += 1;
  run.multiplier = multiplierFor(rules, run.mines, run.gems);
  const done = run.gems >= MINE_TILES - run.mines ? 'cleared' : run.multiplier >= rules.maxMultiplier ? 'capped' : null;
  if (done) run.status = 'done';
  return { kind: 'gem', multiplier: run.multiplier, done };
}

/** A tile nobody has turned over yet, at random (Stake's "random tile"). Null when there is none. */
export function randomHidden(run: MineRun, rng: MineRng = randInt): number | null {
  const hidden = run.revealed.flatMap((shown, i) => (shown ? [] : [i]));
  return hidden.length === 0 ? null : (hidden[rng(0, hidden.length - 1)] as number);
}

/** What a cash out at `multiplier` pays for `bet`, in whole points (rounded to the nearest). */
export const payoutFor = (bet: number, multiplier: number): number => Math.round(bet * multiplier);

/**
 * What a bet is paid back on average by cashing out after `gems` gems with `mines` mines, as a
 * fraction of the bet: the chance of getting that far times the multiplier. 1 - houseEdge, less a
 * hair for the rounding down (and less again where the cap cuts in).
 */
export function expectedReturn(rules: MineRules, mines: number, gems: number): number {
  let survive = 1;
  for (let i = 0; i < gems; i++) survive *= (MINE_TILES - mines - i) / (MINE_TILES - i);
  return survive * multiplierFor(rules, mines, gems);
}
