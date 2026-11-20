import { randInt } from '../random.js';
/*
 * The rules of minesweeper, with no web socket and no players. A board of cols by rows tiles hides
 * `mines` mines, laid on the first tile opened so that it (and the tiles round it) is never one.
 *
 *  - opening a tile shows how many mines touch it; one that touches none opens the tiles round it
 *    too, and so on;
 *  - a flag marks a tile as a mine: it can't be opened until the flag is taken off;
 *  - a chord, on an open tile with as many flags round it as its number, opens the rest round it;
 *  - opening a mine loses; opening every tile that isn't one wins.
 */
/**
 * What a board's pool is multiplied by for how fast it was cleared: 1 at its par time or slower,
 * `most` at half of it or faster, and evenly in between (to two places).
 */
export function speedMultiplier(elapsedMs, parSeconds, most) {
    const par = parSeconds * 1000;
    const ahead = Math.min(1, Math.max(0, (par - elapsedMs) / (par / 2)));
    return Math.round((1 + (most - 1) * ahead) * 100) / 100;
}
/**
 * Shares `total` points between the players of a board by the tiles each opened (`tiles`, by
 * player), in whole points: what's left over of the rounding down goes to whoever opened the most.
 */
export function sharePool(total, tiles) {
    const all = [...tiles.values()].reduce((sum, n) => sum + n, 0);
    const shares = new Map();
    if (all === 0)
        return shares;
    for (const [id, n] of tiles)
        shares.set(id, Math.floor((total * n) / all));
    const most = [...tiles].reduce((best, each) => (each[1] > best[1] ? each : best));
    const left = total - [...shares.values()].reduce((sum, n) => sum + n, 0);
    shares.set(most[0], (shares.get(most[0]) ?? 0) + left);
    return shares;
}
export function newBoard(size) {
    const tiles = size.cols * size.rows;
    const none = () => Array.from({ length: tiles }, () => false);
    return { ...size, laid: false, mine: none(), open: none(), flag: none(), opened: 0, status: 'playing', boom: null };
}
/** The tiles touching `index` (up to eight). */
export function neighbours(board, index) {
    const { cols, rows } = board;
    const x = index % cols;
    const y = Math.floor(index / cols);
    const found = [];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if ((dx !== 0 || dy !== 0) && nx >= 0 && nx < cols && ny >= 0 && ny < rows)
                found.push(ny * cols + nx);
        }
    }
    return found;
}
/** How many mines touch `index`. */
export const minesNear = (board, index) => neighbours(board, index).filter((n) => board.mine[n]).length;
/** How many flags are on the board. */
export const flagCount = (board) => board.flag.filter(Boolean).length;
/** Lays the mines anywhere but `first` and the tiles round it (only `first` itself on a board too full for that). */
function lay(board, first, rng) {
    const tiles = board.cols * board.rows;
    const clear = new Set([first, ...neighbours(board, first)]);
    let free = Array.from({ length: tiles }, (_, i) => i).filter((i) => !clear.has(i));
    if (free.length < board.mines)
        free = Array.from({ length: tiles }, (_, i) => i).filter((i) => i !== first);
    for (let laid = 0; laid < board.mines; laid++) {
        const pick = rng(laid, free.length - 1);
        [free[laid], free[pick]] = [free[pick], free[laid]];
        board.mine[free[laid]] = true;
    }
    board.laid = true;
}
/** Opens `start` and, from every tile that touches no mine, the tiles round it. Flags stay shut. */
function flood(board, start) {
    const todo = [start];
    while (todo.length > 0) {
        const index = todo.pop();
        if (board.open[index] || board.flag[index])
            continue;
        board.open[index] = true;
        board.opened++;
        if (minesNear(board, index) === 0)
            todo.push(...neighbours(board, index));
    }
}
/** Opens each of `tiles` that can be: a mine among them loses, the last safe tile wins. Returns whether anything changed. */
function openAll(board, tiles) {
    const shut = tiles.filter((i) => !board.open[i] && !board.flag[i]);
    if (shut.length === 0)
        return false;
    const hit = shut.find((i) => board.mine[i]);
    if (hit !== undefined) {
        board.status = 'lost';
        board.boom = hit;
        return true;
    }
    for (const index of shut)
        flood(board, index);
    if (board.opened === board.cols * board.rows - board.mines) {
        board.status = 'won';
        // Every mine left is marked, as the classic game does.
        board.flag = board.mine.slice();
    }
    return true;
}
const onBoard = (board, index) => Number.isInteger(index) && index >= 0 && index < board.cols * board.rows;
/** Opens a tile. Returns whether anything changed (not on a flag, an open tile or a board that's over). */
export function openTile(board, index, rng = randInt) {
    if (board.status !== 'playing' || !onBoard(board, index) || board.open[index] || board.flag[index])
        return false;
    if (!board.laid)
        lay(board, index, rng);
    return openAll(board, [index]);
}
/** Puts a flag on a shut tile, or takes it off. Returns whether anything changed. */
export function toggleFlag(board, index) {
    if (board.status !== 'playing' || !onBoard(board, index) || board.open[index])
        return false;
    board.flag[index] = !board.flag[index];
    return true;
}
/** On an open tile with as many flags round it as its number: opens the rest round it. Returns whether anything changed. */
export function chordTile(board, index) {
    if (board.status !== 'playing' || !onBoard(board, index) || !board.open[index])
        return false;
    const round = neighbours(board, index);
    const near = minesNear(board, index);
    if (near === 0 || round.filter((n) => board.flag[n]).length !== near)
        return false;
    return openAll(board, round);
}
/**
 * The board as a player may see it, a character a tile: `#` shut, `F` a flag, `0` to `8` an open
 * tile's number. Where the mines are is only in it once the board is lost: `*` a mine, `!` the one
 * that was opened, `X` a flag that was on no mine.
 */
export function seenTiles(board) {
    const lost = board.status === 'lost';
    let seen = '';
    for (let i = 0; i < board.cols * board.rows; i++) {
        if (board.open[i])
            seen += String(minesNear(board, i));
        else if (lost && i === board.boom)
            seen += '!';
        else if (lost && board.flag[i] && !board.mine[i])
            seen += 'X';
        else if (board.flag[i])
            seen += 'F';
        else if (lost && board.mine[i])
            seen += '*';
        else
            seen += '#';
    }
    return seen;
}
//# sourceMappingURL=minesweeper.js.map