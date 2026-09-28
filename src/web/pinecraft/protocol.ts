import type { PinecraftOre } from '../../constants/index.js';
import type { Direction } from '../../lib/game/pinecraft.js';

/*
 * What Pinecraft's web page (the Koma-UI repo) and the bot say to each other over the WebSocket.
 * Every message is one JSON object with a `t` saying what it is. The page keeps a copy of these
 * types (src/pinecraft/protocol.ts there): change both together.
 *
 * The bot holds the world. The page is sent the rows around the miner, with only the ores the miner
 * can see in them (see viewRows in lib/game/pinecraft.ts).
 *
 *   page -> bot   hello    first message: the token from the link
 *                 mine     starts breaking the block that way (no answer)
 *                 map      asks for the map of everything uncovered
 *                 move     one step; `seq` counts up from 1 with every move. Into a block, it finishes
 *                          breaking it: the bot holds the move until the block's break time has
 *                          passed since its `mine` (or since now, without one)
 *   bot -> page   state    the world around the miner, after the page's move `seq` (0: not after one)
 *                 map      the map asked for
 *                 error    and the bot closes the connection
 *
 * Watching (live.ts): a watch-only page says `watch` with the token from its watch link instead of
 * `hello`, and is then sent everything the player's page is sent about the game (not their errors),
 * starting with `watching` (whose game it is) and the game as it is. `away` says the player's page
 * went away (it may come back). The player is sent `watchers` whenever how many are watching changes.
 * A watcher can ask for the player's `map` too, and is sent `breaking` when the player starts on a block.
 */

export type ClientMessage =
  | { t: 'hello'; token: string }
  | { t: 'watch'; token: string }
  | { t: 'mine'; dir: Direction }
  | { t: 'map' }
  | { t: 'move'; dir: Direction; seq: number };

export interface WorldState {
  /** The player's name. */
  player: string;
  /** The world is size by size blocks. The miner started in the middle of `spawn`, which the page calls 0,0. */
  size: number;
  spawn: { x: number; y: number };
  /** The week the world is for: a new one is a new mine (the page forgets the old one's blocks). */
  week: string;
  /** When the world next starts over (ms). */
  resetsAt: number;
  /** The blocks around the miner: one string per row, a letter per block, from block (left, top). */
  left: number;
  top: number;
  rows: string[];
  x: number;
  y: number;
  energy: number;
  maxEnergy: number;
  /** Milliseconds until the next energy comes back (null when full), and for each one after it. */
  nextEnergyMs: number | null;
  energyMs: number;
  /** The player's points (null if unknown). */
  balance: number | null;
  /** Points this world's ores have paid, all told, and blocks dug. */
  earned: number;
  dug: number;
  /** What each ore pays. */
  values: Record<'dirt' | 'stone' | PinecraftOre, number>;
  /** How long each block takes to break, in ms, with the miner's gear. */
  breakMs: Record<'dirt' | 'stone' | PinecraftOre, number>;
  /** Energy an ore takes to dig (dirt and stone take 1). */
  oreEnergy: number;
  /** With a Dynamite Stick: a blast every `every` blocks dug, the next in `left`. */
  blast: { every: number; left: number } | null;
  /** The pickaxe the miner swings: their equipped one, or the plain wooden one. */
  pickaxe: PinecraftPickaxe;
}

/** The pickaxes the miner can be drawn with (public/pinecraft/pickaxes/<name>.png on the page). */
export type PinecraftPickaxe = 'wood' | 'gold' | 'diamond' | 'ruby' | 'amethyst';

/** What the page's last move did. */
export type WorldEvent =
  | { kind: 'walk' | 'edge' | 'bedrock' | 'tired' }
  | {
      kind: 'dig';
      ground: 'dirt' | 'stone';
      ore: PinecraftOre | null;
      points: number;
      /** The ore paid double. */
      lucky: boolean;
      /** The dig took no energy (an Amethyst Pickaxe). */
      free: boolean;
      /** What a blast broke around the block, if it set one off. */
      blast: { x: number; y: number; ground: 'dirt' | 'stone'; ore: PinecraftOre | null; points: number; lucky: boolean }[] | null;
    };

export type ErrorCode =
  /** The link's token is wrong or too old (or the bot restarted since). */
  | 'bad_token'
  /** The page was opened somewhere else (another tab): only one plays at a time. */
  | 'replaced'
  /** A message that isn't one of the above, or too many of them. */
  | 'bad_message'
  /** The world couldn't be loaded or saved. */
  | 'failed'
  /** Watching: the player isn't playing (any more), or has as many watching as can. */
  | 'not_playing'
  | 'full';

/** Everything the miner has uncovered: the blocks from (left, top), one string per row, with the same letters as the state's rows. */
export interface WorldMap {
  left: number;
  top: number;
  rows: string[];
}

export type ServerMessage =
  | { t: 'state'; seq: number; state: WorldState; event?: WorldEvent }
  | { t: 'map'; map: WorldMap }
  | { t: 'error'; code: ErrorCode }
  | { t: 'watching'; player: string }
  | { t: 'watchers'; count: number }
  | { t: 'away' }
  | { t: 'breaking'; dir: Direction };

const DIRECTIONS = new Set(['up', 'down', 'left', 'right']);

/** Reads a message from the page. Null when it isn't a valid one. */
export function parseClientMessage(text: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  if ((m.t === 'hello' || m.t === 'watch') && typeof m.token === 'string' && m.token.length <= 512) return { t: m.t, token: m.token };
  if (m.t === 'map') return { t: 'map' };
  if (m.t === 'mine' && typeof m.dir === 'string' && DIRECTIONS.has(m.dir)) return { t: 'mine', dir: m.dir as Direction };
  if (m.t === 'move' && typeof m.seq === 'number' && Number.isSafeInteger(m.seq) && m.seq > 0 && typeof m.dir === 'string' && DIRECTIONS.has(m.dir)) {
    return { t: 'move', dir: m.dir as Direction, seq: m.seq };
  }
  return null;
}
