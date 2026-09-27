import { PINECRAFT_ORE_TABLE, PINECRAFT_ORES, PINECRAFT_WORLD, type PinecraftOre } from '../../constants/index.js';

/*
 * The rules of Pinecraft, with no database and no pictures. A member's world is a side-on slice of
 * ground, PINECRAFT_WORLD.width blocks across, under a strip of sky. Everything in it follows from
 * the world's seed, so all that is kept of a world is the seed and which blocks have been dug.
 *
 * The miner moves one block at a time. Open ground (sky, caves, blocks already dug) is walked
 * through for free. Moving into a block digs it, for one energy: an ore in it pays its value (the
 * `pinecraft.value.<ore>` setting), dirt and stone pay nothing. Bedrock, at the bottom, can't be dug.
 * Energy comes back by itself, one every `pinecraft.energyMinutes`, up to `pinecraft.maxEnergy`.
 *
 * Ores are only shown once they are exposed: next to open ground the miner can reach. So digging
 * is exploring, and a cave broken into shows what is in its walls.
 */

export type Direction = 'up' | 'down' | 'left' | 'right';
export const DIRECTIONS: readonly Direction[] = ['left', 'up', 'down', 'right'];

/** What a block of the world is, before anything has been dug. */
export type Ground = 'sky' | 'grass' | 'dirt' | 'stone' | 'cave' | 'bedrock';

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
  /** The blocks dug, by index (row * width + column). */
  mined: Set<number>;
  x: number;
  y: number;
  /** Energy as of `energyAt` (ms); more has come back since, see energyNow. */
  energy: number;
  energyAt: number;
}

const { width: WIDTH, depth: DEPTH, sky: SKY } = PINECRAFT_WORLD;

export const indexOf = (x: number, y: number): number => y * WIDTH + x;
export const inWorld = (x: number, y: number): boolean => x >= 0 && x < WIDTH && y >= 0 && y < DEPTH;

/** Where a new world's miner stands: in the middle, on the grass. */
export const SPAWN = { x: Math.floor(WIDTH / 2), y: SKY - 1 } as const;

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

/** Rows of ground above row `y` (0 for the grass). */
export const depthOf = (y: number): number => y - SKY;

/** What block (x, y) is made of in the world with `seed`, before anything is dug (ores aside, see oreAt). */
export function groundAt(seed: number, x: number, y: number): Ground {
  if (y < SKY) return 'sky';
  if (y === DEPTH - 1) return 'bedrock';
  const depth = depthOf(y);
  if (depth === 0) return 'grass';
  if (depth >= PINECRAFT_WORLD.caveStart) {
    const n = noise(seed, x, y, 6, 1) * 0.7 + noise(seed, x, y, 3, 2) * 0.3;
    if (n > PINECRAFT_WORLD.caveLevel) return 'cave';
  }
  const { dirtRows, mixRows } = PINECRAFT_WORLD;
  if (depth <= dirtRows) return 'dirt';
  if (depth <= dirtRows + mixRows) return hash(seed, x, y, 3) < (depth - dirtRows) / (mixRows + 1) ? 'stone' : 'dirt';
  return 'stone';
}

/** The ore in block (x, y), if any. Ores come in small clumps: blocks close together tend to hold the same one. */
export function oreAt(seed: number, x: number, y: number): PinecraftOre | null {
  const ground = groundAt(seed, x, y);
  if (ground !== 'dirt' && ground !== 'stone') return null;
  const depth = depthOf(y);
  if (depth < PINECRAFT_WORLD.oreStart || hash(seed, x, y, 4) >= PINECRAFT_WORLD.oreChance) return null;
  const here = PINECRAFT_ORES.filter((ore) => PINECRAFT_ORE_TABLE[ore].from <= depth);
  const total = here.reduce((sum, ore) => sum + PINECRAFT_ORE_TABLE[ore].weight, 0);
  let roll = hash(seed, Math.floor(x / 2), Math.floor(y / 2), 5) * total;
  for (const ore of here) {
    roll -= PINECRAFT_ORE_TABLE[ore].weight;
    if (roll < 0) return ore;
  }
  return here[here.length - 1] ?? null;
}

/** Whether block (x, y) can be walked through: sky, a cave, or dug. */
export const isOpen = (world: Pick<PinecraftWorld, 'seed' | 'mined'>, x: number, y: number): boolean => {
  if (world.mined.has(indexOf(x, y))) return true;
  const ground = groundAt(world.seed, x, y);
  return ground === 'sky' || ground === 'cave';
};

/** The energy a world has at `now`, and the time the next one comes back from (whole energies only, the rest carries over). */
export function energyNow(world: Pick<PinecraftWorld, 'energy' | 'energyAt'>, rules: PinecraftRules, now: number): { energy: number; energyAt: number } {
  const per = rules.energyMinutes * 60_000;
  if (per <= 0) return { energy: Math.max(world.energy, rules.maxEnergy), energyAt: now };
  if (world.energy >= rules.maxEnergy) return { energy: world.energy, energyAt: now };
  const gained = Math.floor(Math.max(0, now - world.energyAt) / per);
  const energy = Math.min(rules.maxEnergy, world.energy + gained);
  return { energy, energyAt: energy >= rules.maxEnergy ? now : world.energyAt + gained * per };
}

/** A new world, with full energy and its miner on the grass. */
export function newWorld(seed: number, rules: PinecraftRules, now: number): PinecraftWorld {
  return { seed: seed >>> 0, mined: new Set(), x: SPAWN.x, y: SPAWN.y, energy: rules.maxEnergy, energyAt: now };
}

const STEP: Readonly<Record<Direction, readonly [number, number]>> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

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
  | { kind: 'dig'; ground: 'grass' | 'dirt' | 'stone'; ore: PinecraftOre | null; points: number; index: number };

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
  return { kind: 'dig', ground: ground as 'grass' | 'dirt' | 'stone', ore, points: ore ? rules.value[ore] : 0, index };
}

/**
 * The blocks of rows `top` to `bottom` as the page is shown them, one string per row, a letter a block:
 *   .  open (sky, a cave, or dug)
 *   g d s b   grass, dirt, stone, bedrock the miner can see
 *   D S B     dirt, stone, bedrock not seen yet (a cave or an ore in it isn't shown)
 *   c i o x r e   coal, iron, gold, diamond, ruby, emerald
 * The miner sees every block next to open ground they can walk to (followed up to `look` rows up and down).
 */
export function viewRows(world: PinecraftWorld, top: number, bottom: number, look: number): string[] {
  const from = Math.max(0, Math.min(top, world.y - look));
  const to = Math.min(DEPTH - 1, Math.max(bottom, world.y + look));
  const reached = new Set<number>([indexOf(world.x, world.y)]);
  const queue: [number, number][] = [[world.x, world.y]];
  while (queue.length > 0) {
    const [x, y] = queue.pop() as [number, number];
    for (const [dx, dy] of Object.values(STEP)) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= WIDTH || ny < from || ny > to) continue;
      const i = indexOf(nx, ny);
      if (reached.has(i) || !isOpen(world, nx, ny)) continue;
      reached.add(i);
      queue.push([nx, ny]);
    }
  }
  const seen = (x: number, y: number): boolean =>
    Object.values(STEP).some(([dx, dy]) => reached.has(indexOf(x + dx, y + dy)) && inWorld(x + dx, y + dy));

  const ORE_LETTER: Record<PinecraftOre, string> = { coal: 'c', iron: 'i', gold: 'o', diamond: 'x', ruby: 'r', emerald: 'e' };
  const rows: string[] = [];
  for (let y = Math.max(0, top); y <= Math.min(DEPTH - 1, bottom); y++) {
    let row = '';
    for (let x = 0; x < WIDTH; x++) {
      const ground = groundAt(world.seed, x, y);
      if (reached.has(indexOf(x, y)) || world.mined.has(indexOf(x, y)) || ground === 'sky') {
        row += '.';
        continue;
      }
      const visible = seen(x, y);
      // A cave not reached yet looks like the ground around it.
      const look = ground === 'cave' ? (depthOf(y) <= PINECRAFT_WORLD.dirtRows ? 'dirt' : 'stone') : ground;
      const ore = visible ? oreAt(world.seed, x, y) : null;
      if (ore) row += ORE_LETTER[ore];
      else if (ground === 'cave' && visible) row += '.';
      else {
        const letter = look === 'grass' ? 'g' : look === 'dirt' ? 'd' : look === 'bedrock' ? 'b' : 's';
        row += visible || look === 'grass' ? letter : letter.toUpperCase();
      }
    }
    rows.push(row);
  }
  return rows;
}
