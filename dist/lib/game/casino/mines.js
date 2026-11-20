import { MINE_MINES, MINE_TILES } from '../../../constants/index.js';
import { randInt } from '../../random.js';
/** Whether `mines` is a mine count a round can have. */
export const validMines = (mines) => Number.isInteger(mines) && mines >= MINE_MINES.min && mines <= MINE_MINES.max;
/** The house edge with `mines` mines: edgeFewest with the fewest, sliding evenly to edgeMost with the most. */
export function houseEdge(rules, mines) {
    const span = MINE_MINES.max - MINE_MINES.min;
    const t = span > 0 ? (mines - MINE_MINES.min) / span : 1;
    return rules.edgeFewest + (rules.edgeMost - rules.edgeFewest) * t;
}
/**
 * The multiplier after `gems` gems on a board with `mines` mines: the true odds of turning over that
 * many gems in a row, less the house edge, rounded down to the hundredth and capped at maxMultiplier.
 * 1 before the first gem.
 */
export function multiplierFor(rules, mines, gems) {
    if (gems <= 0)
        return 1;
    let odds = 1;
    for (let i = 0; i < gems; i++)
        odds *= (MINE_TILES - i) / (MINE_TILES - mines - i);
    const paid = Math.floor((1 - houseEdge(rules, mines)) * odds * 100 + 1e-9) / 100;
    return Math.min(rules.maxMultiplier, paid);
}
/** Starts a round with `mines` mines hidden at random. */
export function startRun(mines, rng = randInt) {
    if (!validMines(mines))
        throw new Error(`A mine round can't have ${mines} mines`);
    const tiles = Array.from({ length: MINE_TILES }, (_, i) => i);
    // The first `mines` of a shuffle are the mines.
    for (let i = 0; i < mines; i++) {
        const j = rng(i, MINE_TILES - 1);
        [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    const mine = Array.from({ length: MINE_TILES }, () => false);
    for (const i of tiles.slice(0, mines))
        mine[i] = true;
    return { mines, mine, revealed: mine.map(() => false), gems: 0, multiplier: 1, status: 'playing' };
}
/** Turns over tile `index`. Throws once the round is over. */
export function pick(run, index, rules) {
    if (run.status !== 'playing')
        throw new Error('This round is over');
    if (!Number.isInteger(index) || index < 0 || index >= MINE_TILES || run.revealed[index])
        return { kind: 'taken' };
    run.revealed[index] = true;
    if (run.mine[index]) {
        run.status = 'boom';
        return { kind: 'boom' };
    }
    run.gems += 1;
    run.multiplier = multiplierFor(rules, run.mines, run.gems);
    const done = run.gems >= MINE_TILES - run.mines ? 'cleared' : run.multiplier >= rules.maxMultiplier ? 'capped' : null;
    if (done)
        run.status = 'done';
    return { kind: 'gem', multiplier: run.multiplier, done };
}
/** A tile nobody has turned over yet, at random (Stake's "random tile"). Null when there is none. */
export function randomHidden(run, rng = randInt) {
    const hidden = run.revealed.flatMap((shown, i) => (shown ? [] : [i]));
    return hidden.length === 0 ? null : hidden[rng(0, hidden.length - 1)];
}
/** What a cash out at `multiplier` pays for `bet`, in whole points (rounded to the nearest). */
export const payoutFor = (bet, multiplier) => Math.round(bet * multiplier);
/**
 * What a bet is paid back on average by cashing out after `gems` gems with `mines` mines, as a
 * fraction of the bet: the chance of getting that far times the multiplier. 1 - houseEdge, less a
 * hair for the rounding down (and less again where the cap cuts in).
 */
export function expectedReturn(rules, mines, gems) {
    let survive = 1;
    for (let i = 0; i < gems; i++)
        survive *= (MINE_TILES - mines - i) / (MINE_TILES - i);
    return survive * multiplierFor(rules, mines, gems);
}
//# sourceMappingURL=mines.js.map