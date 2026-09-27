import { PINECRAFT_BREAK_MS, PINECRAFT_ORE_WEIGHTS, PINECRAFT_ORES, PINECRAFT_WORLD, type PinecraftOre } from '../../constants/index.js';

/*
 * The rules of Pinecraft, with no database and no pictures. A member's world is entirely
 * underground: PINECRAFT_WORLD.size blocks each way, the miner starting in an open 3x3 room in the
 * middle with dirt all around. Everything in it follows from the world's seed, so all that is kept
 * of a world is the seed and which blocks have been dug.
 *
 * The miner moves one block at a time. Open ground (the room, blocks already dug) is walked through
 * for free. Moving into a block digs it, for one energy: an ore in it pays its value (the
 * `pinecraft.value.<ore>` setting), dirt and stone pay nothing. Bedrock, here and there, can't be
 * dug. Energy comes back by itself, one every `pinecraft.energyMinutes`, up to `pinecraft.maxEnergy`.
 *
 * Blocks are only shown once they are exposed: next to open ground the miner can walk to. Everything
 * else is dark, so digging is exploring.
 */

export type Direction = 'up' | 'down' | 'left' | 'right';
export const DIRECTIONS: readonly Direction[] = ['left', 'up', 'down', 'right'];
const STEP: Readonly<Record<Direction, readonly [number, number]>> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

/** What a block of the world is, before anything has been dug. */
export type Ground = 'open' | 'dirt' | 'stone' | 'bedrock';

/** The `pinecraft` settings that shape play. */
export interface PinecraftRules {
  maxEnergy: number;
  /** Minutes for one energy to come back. */
  energyMinutes: number;
  /** Points each ore pays. */
  value: Readonly<Record<PinecraftOre, number>>;
}

/** A member's world, as it is played. Changed in place. */
export interface PinecraftWorld {
  seed: number;
  /** The blocks dug, by index (row * size + column). */
  mined: Set<number>;
  x: number;
  y: number;
  /** Energy as of `energyAt` (ms); more has come back since, see energyNow. */
  energy: number;
  energyAt: number;
}

const SIZE = PINECRAFT_WORLD.size;

export const indexOf = (x: number, y: number): number => y * SIZE + x;
export const inWorld = (x: number, y: number): boolean => x >= 0 && x < SIZE && y >= 0 && y < SIZE;

/** Where a new world's miner stands: in the middle of the starting room. */
export const SPAWN = { x: Math.floor(SIZE / 2), y: Math.floor(SIZE / 2) } as const;

/** How far block (x, y) is from the middle of the starting room, diagonals counting as one (the room is up to 1, the dirt around it 2). */
const fromSpawn = (x: number, y: number): number => Math.max(Math.abs(x - SPAWN.x), Math.abs(y - SPAWN.y));

/** A number from 0 to 1 that is always the same for the same inputs. */
export function hash(seed: number, x: number, y: number, salt: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519) + Math.imul(salt, 3266489917)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth noise from 0 to 1: random values on a grid `scale` blocks apart, blended in between. */
function noise(seed: number, x: number, y: number, scale: number, salt: number): number {
  const gx = Math.floor(x / scale);
  const gy = Math.floor(y / scale);
  const fx = x / scale - gx;
  const fy = y / scale - gy;
  const ease = (t: number): number => t * t * (3 - 2 * t);
  const sx = ease(fx);
  const sy = ease(fy);
  const top = hash(seed, gx, gy, salt) * (1 - sx) + hash(seed, gx + 1, gy, salt) * sx;
  const bottom = hash(seed, gx, gy + 1, salt) * (1 - sx) + hash(seed, gx + 1, gy + 1, salt) * sx;
  return top * (1 - sy) + bottom * sy;
}

/** What block (x, y) is made of in the world with `seed`, before anything is dug (ores aside, see oreAt). */
export function groundAt(seed: number, x: number, y: number): Ground {
  const near = fromSpawn(x, y);
  if (near <= 1) return 'open';
  if (near === 2) return 'dirt';
  if (near > 3 && hash(seed, x, y, 6) < PINECRAFT_WORLD.bedrockChance) return 'bedrock';
  const n = noise(seed, x, y, 7, 1) * 0.7 + noise(seed, x, y, 3, 2) * 0.3;
  return n > PINECRAFT_WORLD.stoneLevel ? 'stone' : 'dirt';
}

const ORE_TOTAL = PINECRAFT_ORES.reduce((sum, ore) => sum + PINECRAFT_ORE_WEIGHTS[ore], 0);

/** The ore in block (x, y), if any. Ores come in small clumps: blocks close together tend to hold the same one. */
export function oreAt(seed: number, x: number, y: number): PinecraftOre | null {
  if (fromSpawn(x, y) <= 2) return null;
  const ground = groundAt(seed, x, y);
  if (ground !== 'dirt' && ground !== 'stone') return null;
  if (hash(seed, x, y, 4) >= PINECRAFT_WORLD.oreChance) return null;
  let roll = hash(seed, Math.floor(x / 2), Math.floor(y / 2), 5) * ORE_TOTAL;
  for (const ore of PINECRAFT_ORES) {
    roll -= PINECRAFT_ORE_WEIGHTS[ore];
    if (roll < 0) return ore;
  }
  return PINECRAFT_ORES[PINECRAFT_ORES.length - 1] ?? null;
}

/** Whether block (x, y) can be walked through: the starting room, or dug. */
export const isOpen = (world: Pick<PinecraftWorld, 'seed' | 'mined'>, x: number, y: number): boolean =>
  world.mined.has(indexOf(x, y)) || groundAt(world.seed, x, y) === 'open';

/**
 * How long block (x, y) takes to break (PINECRAFT_BREAK_MS), or null when it can't be: open ground,
 * bedrock, or past the edge.
 */
export function breakMs(world: Pick<PinecraftWorld, 'seed' | 'mined'>, x: number, y: number): number | null {
  if (!inWorld(x, y) || isOpen(world, x, y)) return null;
  const ground = groundAt(world.seed, x, y);
  if (ground === 'bedrock') return null;
  const ore = oreAt(world.seed, x, y);
  return PINECRAFT_BREAK_MS[ore ?? (ground === 'stone' ? 'stone' : 'dirt')];
}

/** The block one step from the miner in `direction`. */
export function stepFrom(world: Pick<PinecraftWorld, 'x' | 'y'>, direction: Direction): { x: number; y: number } {
  const [dx, dy] = STEP[direction];
  return { x: world.x + dx, y: world.y + dy };
}

/** The energy a world has at `now`, and the time the next one comes back from (whole energies only, the rest carries over). */
export function energyNow(world: Pick<PinecraftWorld, 'energy' | 'energyAt'>, rules: PinecraftRules, now: number): { energy: number; energyAt: number } {
  const per = rules.energyMinutes * 60_000;
  if (per <= 0) return { energy: Math.max(world.energy, rules.maxEnergy), energyAt: now };
  if (world.energy >= rules.maxEnergy) return { energy: world.energy, energyAt: now };
  const gained = Math.floor(Math.max(0, now - world.energyAt) / per);
  const energy = Math.min(rules.maxEnergy, world.energy + gained);
  return { energy, energyAt: energy >= rules.maxEnergy ? now : world.energyAt + gained * per };
}

/** A new world, with full energy and its miner in the starting room. */
export function newWorld(seed: number, rules: PinecraftRules, now: number): PinecraftWorld {
  return { seed: seed >>> 0, mined: new Set(), x: SPAWN.x, y: SPAWN.y, energy: rules.maxEnergy, energyAt: now };
}

/** What a move did. */
export type MoveResult =
  /** Through open ground. */
  | { kind: 'walk' }
  /** Into the edge of the world, or bedrock: nothing happened. */
  | { kind: 'edge' }
  | { kind: 'bedrock' }
  /** Out of energy: the block wasn't dug. */
  | { kind: 'tired' }
  /** Dug a block (and stepped into it). `ore` and `points` when there was an ore in it. */
  | { kind: 'dig'; ground: 'dirt' | 'stone'; ore: PinecraftOre | null; points: number; index: number };

/** Moves the miner one block, digging it when it isn't open. */
export function move(world: PinecraftWorld, direction: Direction, rules: PinecraftRules, now: number): MoveResult {
  const [dx, dy] = STEP[direction];
  const x = world.x + dx;
  const y = world.y + dy;
  if (!inWorld(x, y)) return { kind: 'edge' };
  if (isOpen(world, x, y)) {
    world.x = x;
    world.y = y;
    return { kind: 'walk' };
  }
  const ground = groundAt(world.seed, x, y);
  if (ground === 'bedrock') return { kind: 'bedrock' };

  const energy = energyNow(world, rules, now);
  world.energy = energy.energy;
  world.energyAt = energy.energyAt;
  if (world.energy < 1) return { kind: 'tired' };
  world.energy -= 1;

  const index = indexOf(x, y);
  world.mined.add(index);
  world.x = x;
  world.y = y;
  const ore = oreAt(world.seed, x, y);
  return { kind: 'dig', ground: ground as 'dirt' | 'stone', ore, points: ore ? rules.value[ore] : 0, index };
}

/**
 * The blocks from (left, top) to (right, bottom) as the page is shown them, one string per row, a
 * letter a block:
 *   .  open (the starting room, or dug)
 *   d s b   dirt, stone, bedrock
 *   c i o x e r   coal, iron, gold, diamond, emerald, ruby
 *   ?  not seen yet
 * The miner sees every block next to open ground they can walk to (followed up to `look` blocks away).
 */
export function viewRows(world: PinecraftWorld, left: number, top: number, right: number, bottom: number, look: number): string[] {
  const reached = new Set<number>([indexOf(world.x, world.y)]);
  const queue: [number, number][] = [[world.x, world.y]];
  while (queue.length > 0) {
    const [x, y] = queue.pop() as [number, number];
    for (const [dx, dy] of Object.values(STEP)) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inWorld(nx, ny) || Math.abs(nx - world.x) > look || Math.abs(ny - world.y) > look) continue;
      const i = indexOf(nx, ny);
      if (reached.has(i) || !isOpen(world, nx, ny)) continue;
      reached.add(i);
      queue.push([nx, ny]);
    }
  }
  const seen = (x: number, y: number): boolean => Object.values(STEP).some(([dx, dy]) => inWorld(x + dx, y + dy) && reached.has(indexOf(x + dx, y + dy)));

  const ORE_LETTER: Record<PinecraftOre, string> = { coal: 'c', iron: 'i', gold: 'o', diamond: 'x', emerald: 'e', ruby: 'r' };
  const GROUND_LETTER: Record<Exclude<Ground, 'open'>, string> = { dirt: 'd', stone: 's', bedrock: 'b' };
  const rows: string[] = [];
  for (let y = Math.max(0, top); y <= Math.min(SIZE - 1, bottom); y++) {
    let row = '';
    for (let x = Math.max(0, left); x <= Math.min(SIZE - 1, right); x++) {
      if (isOpen(world, x, y)) row += '.';
      else if (!seen(x, y)) row += '?';
      else {
        const ore = oreAt(world.seed, x, y);
        row += ore ? ORE_LETTER[ore] : GROUND_LETTER[groundAt(world.seed, x, y) as Exclude<Ground, 'open'>];
      }
    }
    rows.push(row);
  }
  return rows;
}
