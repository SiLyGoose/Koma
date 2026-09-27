import type { PinecraftOre } from '../constants/index.js';
import type { Direction } from '../lib/game/pinecraft.js';

/*
 * What Pinecraft's web page (the Koma-UI repo) and the bot say to each other over the WebSocket.
 * Every message is one JSON object with a `t` saying what it is. The page keeps a copy of these
 * types (src/pinecraft/protocol.ts there): change both together.
 *
 * The bot holds the world. The page is sent the rows around the miner, with only the ores the miner
 * can see in them (see viewRows in lib/game/pinecraft.ts).
 *
 *   page -> bot   hello    first message: the token from the link
 *                 move     one step; `seq` counts up from 1 with every move
 *   bot -> page   state    the world around the miner, after the page's move `seq` (0: not after one)
 *                 error    and the bot closes the connection
 */

export type ClientMessage = { t: 'hello'; token: string } | { t: 'move'; dir: Direction; seq: number };

export interface WorldState {
  /** The player's name. */
  player: string;
  /** Blocks across, rows in all, and rows of sky at the top. */
  width: number;
  depth: number;
  sky: number;
  /** The rows sent start at row `top`; one string per row, a letter per block (see viewRows). */
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
  /** Points this world's ores have paid, all told. */
  earned: number;
  /** What each ore pays, and how many rows down it starts to turn up. */
  values: Record<PinecraftOre, number>;
  from: Record<PinecraftOre, number>;
}

/** What the page's last move did. */
export type WorldEvent =
  | { kind: 'walk' | 'edge' | 'bedrock' | 'tired' }
  | { kind: 'dig'; ground: 'grass' | 'dirt' | 'stone'; ore: PinecraftOre | null; points: number };

export type ErrorCode =
  /** The link's token is wrong or too old (or the bot restarted since). */
  | 'bad_token'
  /** The page was opened somewhere else (another tab): only one plays at a time. */
  | 'replaced'
  /** A message that isn't one of the above, or too many of them. */
  | 'bad_message'
  /** The world couldn't be loaded or saved. */
  | 'failed';

export type ServerMessage = { t: 'state'; seq: number; state: WorldState; event?: WorldEvent } | { t: 'error'; code: ErrorCode };

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
  if (m.t === 'hello' && typeof m.token === 'string' && m.token.length <= 512) return { t: 'hello', token: m.token };
  if (m.t === 'move' && typeof m.seq === 'number' && Number.isSafeInteger(m.seq) && m.seq > 0 && typeof m.dir === 'string' && DIRECTIONS.has(m.dir)) {
    return { t: 'move', dir: m.dir as Direction, seq: m.seq };
  }
  return null;
}
