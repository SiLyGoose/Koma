import type { MineOre } from '../constants/index.js';
import type { Direction } from '../lib/game/mine.js';

/*
 * What the mine's web page (the Koma-UI repo) and the bot say to each other over the WebSocket.
 * Every message is one JSON object with a `t` saying what it is. The page keeps a copy of these
 * types (src/protocol.ts there): change both together.
 *
 * The bot holds the field. The page is only ever told what has been dug, so nothing in the page
 * (or its dev tools) gives away where the dynamite is; the whole field is shown once the run is over.
 *
 * A link lets one member play (see token.ts): it opens their run if one is going, and the lobby
 * otherwise, where they can start a new one.
 *
 *   page -> bot   hello    first message: the token from the link
 *                 start    a new run with this bet (from the lobby)
 *                 move     one step; `seq` counts up from 1 with every start, move or cash out
 *                 cashout
 *   bot -> page   lobby    no run going: the balance and what a bet can be
 *                 state    the run as it is now, after the page's message `seq` (0: not after one)
 *                 refused  a start that couldn't happen, and why (nothing was taken)
 *                 error    and the bot closes the connection
 */

export type ClientMessage =
  | { t: 'hello'; token: string }
  | { t: 'start'; bet: number | 'all'; seq: number }
  | { t: 'move'; dir: Direction; seq: number }
  | { t: 'cashout'; seq: number };

/** A tile as the page sees it: null while it is hidden. */
export type SeenTile = null | 'rock' | 'dynamite' | MineOre;

export type RunStatus =
  /** Being played. */
  | 'digging'
  /** Dynamite went off: the bet is lost. */
  | 'boom'
  /** Cashed out by the player. */
  | 'cashed'
  /** Cashed out by itself, after being left alone. */
  | 'idle'
  /** Something went wrong; it was cashed out at the multiplier reached, if it could be. */
  | 'failed';

export interface RunState {
  /** The player's name. */
  player: string;
  /** The field is size by size tiles, row by row from the top left. */
  size: number;
  tiles: SeenTile[];
  /** Which tiles have been dug (once the run is over every tile is in `tiles`, and these say which were dug). */
  dug: boolean[];
  pos: number;
  field: number;
  oresLeft: number;
  /** Dynamite on this field. */
  dynamite: number;
  bet: number;
  /** The player's points: after the bet was taken while it is played, after the payout once it is over (null if unknown). */
  balance: number | null;
  multiplier: number;
  /** What cashing out now pays, in points. */
  cashOut: number;
  status: RunStatus;
  /** What the run paid, once it is over (0 after dynamite). */
  payout: number | null;
  /** A run with no move for this long is cashed out by itself. */
  idleMs: number;
  /** What each ore adds, and what clearing a field adds, for the page's legend. */
  values: Record<MineOre, number>;
  fieldBonus: number;
}

/** What the page's last message did, for its log line and effects. */
export type RunEvent =
  | { kind: 'walk' | 'edge' | 'rock' | 'boom' | 'cashout' | 'idle' | 'failed' }
  | { kind: 'ore'; ore: MineOre; gained: number }
  | { kind: 'cleared'; ore: MineOre; gained: number; bonus: number };

export type ErrorCode =
  /** The link's token is wrong or too old (or the bot restarted since). */
  | 'bad_token'
  /** The page was opened somewhere else (another tab): only one plays at a time. */
  | 'replaced'
  /** A message that isn't one of the above, or too many of them. */
  | 'bad_message';

/** No run going: what the lobby needs to start one. */
export interface Lobby {
  player: string;
  balance: number;
  minBet: number;
  maxBet: number;
  /** The bet of the run just played, if any, for "again", "double" and "half". */
  lastBet: number | null;
  /** How the first field of a new run is laid out. */
  ores: number;
  dynamite: number;
  values: Record<MineOre, number>;
  fieldBonus: number;
}

export type StartRefusal =
  /** Out of the bet range (`limit` is the end it broke). */
  | { reason: 'too_small' | 'too_big'; limit: number }
  /** More than they have. */
  | { reason: 'too_poor'; balance: number }
  /** They already have a run going (in Discord, or another tab). */
  | { reason: 'busy' };

export type ServerMessage =
  | { t: 'lobby'; lobby: Lobby }
  | { t: 'state'; seq: number; state: RunState; event?: RunEvent }
  | ({ t: 'refused'; seq: number } & StartRefusal)
  | { t: 'error'; code: ErrorCode };

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
  const seqOk = typeof m.seq === 'number' && Number.isSafeInteger(m.seq) && m.seq > 0;
  if (m.t === 'hello' && typeof m.token === 'string' && m.token.length <= 512) return { t: 'hello', token: m.token };
  if (m.t === 'start' && seqOk && (m.bet === 'all' || (typeof m.bet === 'number' && Number.isSafeInteger(m.bet) && m.bet > 0))) {
    return { t: 'start', bet: m.bet as number | 'all', seq: m.seq as number };
  }
  if (m.t === 'move' && seqOk && typeof m.dir === 'string' && DIRECTIONS.has(m.dir)) return { t: 'move', dir: m.dir as Direction, seq: m.seq as number };
  if (m.t === 'cashout' && seqOk) return { t: 'cashout', seq: m.seq as number };
  return null;
}
