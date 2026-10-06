import { MINE_TILES } from '../../../constants/index.js';

/*
 * What the mine's web page (the Koma-UI repo) and the bot say to each other over the WebSocket.
 * Every message is one JSON object with a `t` saying what it is. The page keeps a copy of these
 * types (src/mines/protocol.ts there): change both together.
 *
 * The bot holds the board. The page is only ever told what has been turned over, so nothing in the
 * page (or its dev tools) gives away where the mines are; the whole board is shown once the round is over.
 *
 * A link lets one member play (see token.ts): it opens their round if one is going, and the lobby
 * otherwise, where they can start a new one.
 *
 *   page -> bot   hello    first message: the token from the link
 *                 start    a new round with this bet and this many mines (from the lobby)
 *                 pick     turn over tile `index` (0 to 24, row by row from the top left), or a random one
 *                 cashout
 *                 `seq` counts up from 1 with every start, pick or cash out
 *   bot -> page   lobby    no round going: the balance, what a bet can be, and how the multipliers work
 *                 state    the round as it is now, after the page's message `seq` (0: not after one)
 *                 refused  a start that couldn't happen, and why (nothing was taken)
 *                 error    and the bot closes the connection
 *
 * Watching (live.ts): a watch-only page says `watch` with the token from its watch link instead of
 * `hello`, and is then sent everything the player's page is sent about the game (not their errors),
 * starting with `watching` (whose game it is) and the game as it is. `away` says the player's page
 * went away (it may come back). The player is sent `watchers` whenever how many are watching changes.
 */

export type ClientMessage =
  | { t: 'hello'; token: string }
  | { t: 'watch'; token: string }
  | { t: 'start'; bet: number | 'all'; mines: number; seq: number }
  | { t: 'pick'; index: number | 'random'; seq: number }
  | { t: 'cashout'; seq: number };

/** A tile as the page sees it: null while it is face down. */
export type SeenTile = null | 'gem' | 'mine';

export type RunStatus =
  /** Being played. */
  | 'playing'
  /** A mine was turned over: the bet is lost. */
  | 'boom'
  /** Cashed out by the player. */
  | 'cashed'
  /** Every gem turned over, or the multiplier reached the cap: cashed out by itself. */
  | 'done'
  /** Cashed out by itself, after being left alone. */
  | 'idle'
  /** Something went wrong; it was cashed out at the multiplier reached, if it could be. */
  | 'failed';

export interface RunState {
  /** The player's name. */
  player: string;
  /** The board is size by size tiles, row by row from the top left. */
  size: number;
  mines: number;
  /** What each tile is, once turned over (once the round is over every tile is here, and `revealed` says which were turned over). */
  tiles: SeenTile[];
  revealed: boolean[];
  gems: number;
  bet: number;
  /** The player's points: after the bet was taken while it is played, after the payout once it is over (null if unknown). */
  balance: number | null;
  multiplier: number;
  /** What the next gem would take the multiplier to (null when there is no next gem). */
  next: number | null;
  /** What cashing out now pays, in points. */
  cashOut: number;
  maxMultiplier: number;
  status: RunStatus;
  /** What the round paid, once it is over (0 after a mine). */
  payout: number | null;
  /** A round with no pick for this long is cashed out by itself. */
  idleMs: number;
}

/** What the page's last message did, for its effects. */
export type RunEvent =
  | { kind: 'gem'; index: number }
  | { kind: 'boom'; index: number }
  | { kind: 'cashout' | 'cleared' | 'capped' | 'idle' | 'failed' };

export type ErrorCode =
  /** The link's token is wrong or too old (or the bot restarted since). */
  | 'bad_token'
  /** The page was opened somewhere else (another tab): only one plays at a time. */
  | 'replaced'
  /** A message that isn't one of the above, or too many of them. */
  | 'bad_message'
  /** Watching: the player isn't playing (any more), or has as many watching as can. */
  | 'not_playing'
  | 'full';

/** No round going: what the lobby needs to start one. */
export interface Lobby {
  player: string;
  balance: number;
  minBet: number;
  maxBet: number;
  /** The bet and mines of the round just played, if any. */
  lastBet: number | null;
  lastMines: number | null;
  /** How many mines a round can have. */
  minMines: number;
  maxMines: number;
  /** For showing multipliers before a round: the house edge with the fewest and the most mines, and the cap. */
  edgeFewest: number;
  edgeMost: number;
  maxMultiplier: number;
}

export type StartRefusal =
  /** Out of the bet range (`limit` is the end it broke). */
  | { reason: 'too_small' | 'too_big'; limit: number }
  /** More than they have. */
  | { reason: 'too_poor'; balance: number }
  /** They already have a round going (in Discord, or another tab). */
  | { reason: 'busy' };

export type ServerMessage =
  | { t: 'lobby'; lobby: Lobby }
  | { t: 'state'; seq: number; state: RunState; event?: RunEvent }
  | ({ t: 'refused'; seq: number } & StartRefusal)
  | { t: 'error'; code: ErrorCode }
  | { t: 'watching'; player: string }
  | { t: 'watchers'; count: number }
  | { t: 'away' };

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
  const seq = m.seq as number;
  if ((m.t === 'hello' || m.t === 'watch') && typeof m.token === 'string' && m.token.length <= 512) return { t: m.t, token: m.token };
  if (m.t === 'start' && seqOk && Number.isSafeInteger(m.mines) && (m.bet === 'all' || (typeof m.bet === 'number' && Number.isSafeInteger(m.bet) && m.bet > 0))) {
    return { t: 'start', bet: m.bet as number | 'all', mines: m.mines as number, seq };
  }
  if (m.t === 'pick' && seqOk && (m.index === 'random' || (typeof m.index === 'number' && Number.isInteger(m.index) && m.index >= 0 && m.index < MINE_TILES))) {
    return { t: 'pick', index: m.index as number | 'random', seq };
  }
  if (m.t === 'cashout' && seqOk) return { t: 'cashout', seq };
  return null;
}
