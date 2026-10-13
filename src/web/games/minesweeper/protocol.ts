import { MINESWEEPER_LEVELS, type MinesweeperLevel } from '../../../constants/index.js';
import { parseChat, type ChatClientMessage, type ChatServerMessage } from '../chat.js';

/*
 * What minesweeper's web page (the Koma-UI repo) and the bot say to each other over the WebSocket.
 * Every message is one JSON object with a `t` saying what it is. The page keeps a copy of these types
 * (src/minesweeper/protocol.ts there): change both together.
 *
 * A server has one room (web/games/minesweeper/room.ts): everyone opening minesweeper there plays the
 * same board. The bot holds it, and a page is only ever told what has been opened, so nothing in the
 * page (or its dev tools) gives away where the mines are until the board is lost.
 *
 *   page -> bot   hello    first message: the token from the link
 *                 new      a new board at `level`, in place of the one there
 *                 open     opens tile `index` (row by row from the top left)
 *                 flag     puts a flag on tile `index`, or takes it off
 *                 chord    on an open tile with as many flags round it as its number: opens the rest round it
 *                 cursor   where this page's mouse is over the board, in tiles from its top left
 *                          (2.5 across is the middle of the third column), or null once it's off it
 *                 chat     says something to the room (web/games/chat.ts, with what the bot sends back)
 *   bot -> page   room     the room as it is now: whenever anything about it changes
 *                 cursor   where another player's mouse is (never this page's own), or null
 *                 error    and the bot closes the connection
 */

export type ClientMessage =
  | { t: 'hello'; token: string }
  | { t: 'new'; level: MinesweeperLevel }
  | { t: 'open' | 'flag' | 'chord'; index: number }
  | { t: 'cursor'; at: [x: number, y: number] | null }
  | ChatClientMessage;

/** Someone with the page open. */
export interface PlayerView {
  /** The member's id. */
  id: string;
  name: string;
  /** Their profile picture. */
  avatar: string;
  /** Which colour they are (their cursor and name), from 0. */
  colour: number;
  /**
   * Their record in this server, all told: mines they opened (but for those someone else's wrong flag
   * sent their chord into), boards they helped clear, and times a wrong flag of theirs did that to
   * someone else.
   */
  bombs: number;
  wins: number;
  trolls: number;
}

export interface GameView {
  /** Counts up with every board the room starts, so the page knows a new one from one it has shown. */
  no: number;
  level: MinesweeperLevel;
  cols: number;
  rows: number;
  mines: number;
  /**
   * A character a tile, row by row: `#` shut, `F` a flag, `0` to `8` an open tile's number. Once the
   * board is lost, `*` a mine, `!` the one that was opened, `X` a flag that was on no mine.
   */
  tiles: string;
  /** Flags on the board. */
  flags: number;
  /** Who put down each flag on the board (a member's id), by its tile. */
  flaggers: Record<number, string>;
  /** 'ready': nobody has opened a tile yet (the clock hasn't started). */
  status: 'ready' | 'playing' | 'won' | 'lost';
  /** Time used: from the first tile opened to now, or to when it was won or lost. */
  elapsedMs: number;
  /** Who opened the last tile of a board that's over (the mine, or the tile that won it). */
  by: string | null;
  /**
   * On a board lost to a chord: whose flags, round the number chorded, were on no mine (what sent the
   * chord into one). Empty otherwise.
   */
  blamed: string[];
}

export interface RoomState {
  /** This page's player. */
  you: string;
  players: PlayerView[];
  levels: Record<MinesweeperLevel, { cols: number; rows: number; mines: number }>;
  /** The board being played, or the last one (a room starts on a beginner's). */
  game: GameView;
}

export type ErrorCode =
  /** The link's token is wrong or too old (or the bot restarted since). */
  | 'bad_token'
  /** The page was opened somewhere else (another tab): only one plays at a time. */
  | 'replaced'
  /** A message that isn't one of the above, or too many of them. */
  | 'bad_message'
  /** The room has as many players as it can. */
  | 'full';

export type ServerMessage =
  | { t: 'room'; state: RoomState }
  | { t: 'cursor'; id: string; at: [x: number, y: number] | null }
  | { t: 'error'; code: ErrorCode }
  | ChatServerMessage;

/** The widest and tallest any board is: a cursor is somewhere within it. */
const MAX_SPAN = Math.max(...Object.values(MINESWEEPER_LEVELS).flatMap((l) => [l.cols, l.rows]));
const within = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= MAX_SPAN;
const count = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

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
  if (m.t === 'new' && typeof m.level === 'string' && Object.hasOwn(MINESWEEPER_LEVELS, m.level)) return { t: 'new', level: m.level as MinesweeperLevel };
  if ((m.t === 'open' || m.t === 'flag' || m.t === 'chord') && count(m.index)) return { t: m.t, index: m.index };
  if (m.t === 'chat') return parseChat(m);
  if (m.t === 'cursor' && m.at === null) return { t: 'cursor', at: null };
  if (m.t === 'cursor' && Array.isArray(m.at) && m.at.length === 2 && within(m.at[0]) && within(m.at[1])) return { t: 'cursor', at: [m.at[0], m.at[1]] };
  return null;
}
