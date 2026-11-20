import type { ChatClientMessage, ChatServerMessage } from './chat.js';

/*
 * What minesweeper's web page (the Koma-UI repo) and the bot say to each other over the WebSocket.
 * Every message is one JSON object with a `t` saying what it is. The site keeps a copy (its `yarn sync`).
 *
 * A server has one room (the bot's web/games/minesweeper/room.ts): everyone opening minesweeper there plays the
 * same board. The bot holds it, and a page is only ever told what has been opened, so nothing in the
 * page (or its dev tools) gives away where the mines are until the board is lost. A board cleared
 * pays its level's pool of points (`rewards`), more for being quick, shared between everyone who
 * opened its tiles by how many each opened (`paid`). The fastest clears of each level in the server
 * are kept, with who cleared them (`best`).
 *
 *   page -> bot   hello    first message: the token from the link
 *                 new      a new board at `level`, in place of the one there
 *                 open     opens tile `index` (row by row from the top left)
 *                 flag     puts a flag on tile `index`, or takes it off
 *                 chord    on an open tile with as many flags round it as its number: opens the rest round it
 *                 cursor   where this page's mouse is over the board, in tiles from its top left
 *                          (2.5 across is the middle of the third column), or null once it's off it
 *                 chat     says something to the room (./chat.ts, with what the bot sends back)
 *   bot -> page   room     the room as it is now: whenever anything about it changes
 *                 best     the server's fastest clears of each level: on joining, and whenever a clear makes them
 *                 cursor   where another player's mouse is (never this page's own), or null
 *                 error    and the bot closes the connection
 */

/** The boards, easiest first (the classic three: how big each is, the bot's constants/minesweeper.ts). */
export const MINESWEEPER_LEVEL_IDS = ['easy', 'medium', 'hard'] as const;
export type MinesweeperLevel = (typeof MINESWEEPER_LEVEL_IDS)[number];

/** What a board cleared pays: each level's pool and par time (seconds), and the most the pool is multiplied by for speed (at half of par). */
export interface MinesweeperRewards {
  pool: Record<MinesweeperLevel, number>;
  parSeconds: Record<MinesweeperLevel, number>;
  speedBonus: number;
}

/** A board cleared: how long it took, when (ms since 1970), and everyone who opened a tile of it, whoever opened most first. */
export interface MinesweeperClear {
  ms: number;
  at: number;
  players: { id: string; name: string; tiles: number }[];
}

/** A server's fastest clears of each level, fastest first (of two as fast, the earlier). */
export type MinesweeperBest = Record<MinesweeperLevel, MinesweeperClear[]>;

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
  /** On a board cleared: what it paid, and to whom. Null otherwise. */
  paid: PaidView | null;
  /** On a board cleared fast enough for its level's leaderboard: where it came on it, from 1. Null otherwise. */
  rank: number | null;
}

/** What a board cleared paid. */
export interface PaidView {
  /** What its level's pool was multiplied by for how fast it was cleared (1: no faster than par). */
  bonus: number;
  /** The points paid, all told: the pool times `bonus`. */
  total: number;
  /** Everyone who opened a tile of it (still in the room or not), whoever was paid most first: the tiles they opened and the points that paid them. */
  shares: { id: string; name: string; tiles: number; points: number }[];
}

export interface RoomState {
  /** This page's player. */
  you: string;
  players: PlayerView[];
  levels: Record<MinesweeperLevel, { cols: number; rows: number; mines: number }>;
  /** What a board cleared pays: each level's pool and par time (seconds), and the most the pool is multiplied by for speed (at half of par). */
  rewards: MinesweeperRewards;
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
  | { t: 'best'; best: MinesweeperBest }
  | { t: 'cursor'; id: string; at: [x: number, y: number] | null }
  | { t: 'error'; code: ErrorCode }
  | ChatServerMessage;
