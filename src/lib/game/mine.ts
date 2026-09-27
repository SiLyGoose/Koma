import { MINE_ORE_WEIGHTS, MINE_ORES, MINE_SIZE, type MineOre } from '../../constants/index.js';
import { randInt } from '../random.js';

/*
 * The rules of the mine, with no database and no pictures. The miner stands in the middle of a
 * MINE_SIZE by MINE_SIZE field of hidden tiles and moves one tile up, down, left or right at a
 * time. Stepping onto a hidden tile digs it:
 *
 *  - an ore adds its value (the `mine.value.<ore>` setting) to the multiplier, which starts at 1x;
 *  - rock is worth nothing;
 *  - dynamite ends the run, and the bet is lost.
 *
 * Tiles already dug can be walked over freely. Once every ore of a field has been dug, the field
 * is cleared: the multiplier gets the field bonus, and a new field is laid out with the miner back
 * in the middle and more dynamite in it. The miner can cash out whenever they like, for the bet
 * times the multiplier.
 *
 * Every field is laid out so each ore and rock can be reached from the middle without stepping on
 * dynamite, so clearing a field is always possible (with some luck).
 */

/** How many tiles the field has, and the one in the middle, where the miner starts. */
export const TILE_COUNT = MINE_SIZE * MINE_SIZE;
export const CENTER = (TILE_COUNT - 1) / 2;

export type MineTile = { kind: 'rock' } | { kind: 'ore'; ore: MineOre } | { kind: 'dynamite' };

/** The `mine` settings that shape a run. */
export interface MineRules {
  /** Ores on every field. */
  ores: number;
  /** Dynamite on the first field, how much more each next field has, and the most a field can have. */
  dynamite: number;
  dynamiteStep: number;
  maxDynamite: number;
  /** Added to the multiplier for clearing a field. */
  fieldBonus: number;
  /** Added to the multiplier by each ore. */
  value: Readonly<Record<MineOre, number>>;
}

/** A run in the mine. Changed in place as it is played. */
export interface MineRun {
  /** The field's tiles, row by row from the top left. */
  tiles: MineTile[];
  /** Which tiles have been dug (the middle one starts dug: the miner stands on it). */
  dug: boolean[];
  /** The tile the miner is on. */
  pos: number;
  /** Which field this is, counting from 1. */
  field: number;
  /** What a cash out pays, as a multiple of the bet. */
  multiplier: number;
  /** Ores on this field not dug yet. */
  oresLeft: number;
  /** 'boom' once the miner has dug up dynamite: the run is over and the bet lost. */
  status: 'digging' | 'boom';
}

/** Random numbers the rules use (both ends included), so tests can choose them. */
export type MineRng = (min: number, max: number) => number;

export type Direction = 'up' | 'down' | 'left' | 'right';
export const DIRECTIONS: readonly Direction[] = ['left', 'up', 'down', 'right'];

/** Multipliers are kept to a few decimals, so adding 0.1 ten times is exactly 2. */
const tidy = (n: number): number => Math.round(n * 1e6) / 1e6;

/** How much dynamite field `field` (counting from 1) has. */
export const dynamiteOn = (rules: MineRules, field: number): number =>
  Math.min(rules.maxDynamite, rules.dynamite + (field - 1) * rules.dynamiteStep);

/** The tile one step from `pos` in `direction`, or null past the edge. */
export function stepFrom(pos: number, direction: Direction): number | null {
  const row = Math.floor(pos / MINE_SIZE);
  const col = pos % MINE_SIZE;
  switch (direction) {
    case 'up':
      return row > 0 ? pos - MINE_SIZE : null;
    case 'down':
      return row < MINE_SIZE - 1 ? pos + MINE_SIZE : null;
    case 'left':
      return col > 0 ? pos - 1 : null;
    case 'right':
      return col < MINE_SIZE - 1 ? pos + 1 : null;
  }
}

/** Whether every tile that isn't dynamite can be reached from the middle without stepping on dynamite. */
export function allReachable(tiles: readonly MineTile[]): boolean {
  const seen = new Set<number>([CENTER]);
  const queue = [CENTER];
  while (queue.length > 0) {
    const at = queue.pop() as number;
    for (const direction of DIRECTIONS) {
      const next = stepFrom(at, direction);
      if (next === null || seen.has(next) || tiles[next]?.kind === 'dynamite') continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return tiles.every((tile, i) => tile.kind === 'dynamite' || seen.has(i));
}

/** Picks an ore by MINE_ORE_WEIGHTS. */
export function rollOre(rng: MineRng = randInt): MineOre {
  const total = MINE_ORES.reduce((sum, ore) => sum + MINE_ORE_WEIGHTS[ore], 0);
  let roll = rng(1, total);
  for (const ore of MINE_ORES) {
    roll -= MINE_ORE_WEIGHTS[ore];
    if (roll <= 0) return ore;
  }
  return MINE_ORES[0];
}

/** Puts `count` of the tiles in `free` (a list of tile numbers, shuffled in place) first, at random. */
function shuffleFirst(free: number[], count: number, rng: MineRng): void {
  for (let i = 0; i < count; i++) {
    const j = rng(i, free.length - 1);
    [free[i], free[j]] = [free[j] as number, free[i] as number];
  }
}

/** Tries this many layouts for one with every ore reachable before giving up (with the allowed settings it takes a few at most). */
const LAYOUT_TRIES = 10_000;

/** Lays out field `field`: its dynamite where every other tile can still be reached, then its ores, then rock. */
export function layField(rules: MineRules, field: number, rng: MineRng = randInt): MineTile[] {
  const dynamite = dynamiteOn(rules, field);
  const others = Array.from({ length: TILE_COUNT }, (_, i) => i).filter((i) => i !== CENTER);
  for (let attempt = 0; attempt < LAYOUT_TRIES; attempt++) {
    const tiles: MineTile[] = Array.from({ length: TILE_COUNT }, () => ({ kind: 'rock' }));
    const free = [...others];
    shuffleFirst(free, dynamite, rng);
    for (const i of free.slice(0, dynamite)) tiles[i] = { kind: 'dynamite' };
    if (!allReachable(tiles)) continue;
    const rest = free.slice(dynamite);
    shuffleFirst(rest, rules.ores, rng);
    for (const i of rest.slice(0, rules.ores)) tiles[i] = { kind: 'ore', ore: rollOre(rng) };
    return tiles;
  }
  throw new Error(`Could not lay out a mine field with ${dynamite} dynamite where every tile can be reached`);
}

/** A new field on `run`, with the miner back in the middle. */
function enterField(run: MineRun, rules: MineRules, field: number, rng: MineRng): void {
  run.tiles = layField(rules, field, rng);
  run.dug = run.tiles.map((_, i) => i === CENTER);
  run.pos = CENTER;
  run.field = field;
  run.oresLeft = rules.ores;
}

/** Starts a run on the first field, at 1x. */
export function startRun(rules: MineRules, rng: MineRng = randInt): MineRun {
  const run: MineRun = { tiles: [], dug: [], pos: CENTER, field: 1, multiplier: 1, oresLeft: 0, status: 'digging' };
  enterField(run, rules, 1, rng);
  return run;
}

/** What a step did. */
export type StepResult =
  /** Onto a tile already dug, or into the edge (nothing happened). */
  | { kind: 'walk' }
  | { kind: 'edge' }
  | { kind: 'rock' }
  /** `gained` is what the ore added to the multiplier. */
  | { kind: 'ore'; ore: MineOre; gained: number }
  /** The field's last ore: `gained` as for any ore, and the field bonus. The run is on a new field now. */
  | { kind: 'cleared'; ore: MineOre; gained: number; bonus: number }
  | { kind: 'boom' };

/** Moves the miner one tile, digging it if it is hidden. Throws once the run has blown up. */
export function step(run: MineRun, direction: Direction, rules: MineRules, rng: MineRng = randInt): StepResult {
  if (run.status !== 'digging') throw new Error('This run is over');
  const next = stepFrom(run.pos, direction);
  if (next === null) return { kind: 'edge' };
  run.pos = next;
  if (run.dug[next]) return { kind: 'walk' };

  run.dug[next] = true;
  const tile = run.tiles[next] as MineTile;
  if (tile.kind === 'dynamite') {
    run.status = 'boom';
    return { kind: 'boom' };
  }
  if (tile.kind === 'rock') return { kind: 'rock' };

  const gained = rules.value[tile.ore];
  run.multiplier = tidy(run.multiplier + gained);
  run.oresLeft--;
  if (run.oresLeft > 0) return { kind: 'ore', ore: tile.ore, gained };

  run.multiplier = tidy(run.multiplier + rules.fieldBonus);
  enterField(run, rules, run.field + 1, rng);
  return { kind: 'cleared', ore: tile.ore, gained, bonus: rules.fieldBonus };
}

/** What a cash out at `multiplier` pays for `bet`, in whole points (rounded to the nearest). */
export const payoutFor = (bet: number, multiplier: number): number => Math.round(bet * multiplier);

/** How many tiles of a field are neither ore, dynamite nor the middle. */
export const rockOn = (rules: MineRules, field: number): number => TILE_COUNT - 1 - rules.ores - dynamiteOn(rules, field);

/**
 * What a bet is paid back on average by the best possible play that digs at least once, as a
 * fraction of the bet: 1 breaks even, below 1 means the house wins in the long run. (Cashing out
 * without digging always gives the bet back.) The miner can't see what a tile holds, so every hidden
 * tile is as likely as any other to be dynamite; this treats them that way, and leaves out the
 * small effect of every field being laid out so its ores can all be reached. Fields past
 * `maxFields` are not looked into (a miner that deep cashes out). Takes a second or two.
 */
export function expectedReturn(rules: MineRules, maxFields = 40): number {
  const total = MINE_ORES.reduce((sum, ore) => sum + MINE_ORE_WEIGHTS[ore], 0);
  const ores = MINE_ORES.map((ore) => ({ chance: MINE_ORE_WEIGHTS[ore] / total, gained: rules.value[ore] }));
  const memo = new Map<string, number>();

  // Worth of going on digging on field `field`, with `left` ores and `rock` rock still hidden, at `multiplier`.
  const dig = (field: number, left: number, rock: number, multiplier: number): number => {
    const hidden = left + rock + dynamiteOn(rules, field);
    let worth = 0;
    if (rock > 0) worth += (rock / hidden) * best(field, left, rock - 1, multiplier);
    for (const { chance, gained } of ores) {
      const after = tidy(multiplier + gained);
      worth +=
        (left / hidden) *
        chance *
        (left === 1 ? best(field + 1, rules.ores, rockOn(rules, field + 1), tidy(after + rules.fieldBonus)) : best(field, left - 1, rock, after));
    }
    return worth;
  };
  // Worth of a run in that spot, played as well as it can be: cash out, or dig on, whichever is worth more.
  const best = (field: number, left: number, rock: number, multiplier: number): number => {
    if (field > maxFields) return multiplier;
    const key = `${field},${left},${rock},${multiplier}`;
    const known = memo.get(key);
    if (known !== undefined) return known;
    const worth = Math.max(multiplier, dig(field, left, rock, multiplier));
    memo.set(key, worth);
    return worth;
  };
  return dig(1, rules.ores, rockOn(rules, 1), 1);
}
