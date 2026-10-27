import type { Card } from './cards.js';
import type { ChatClientMessage, ChatServerMessage } from './chat.js';

/*
 * What poker's web page (the Koma-UI repo) and the bot say to each other over the WebSocket. Every
 * message is one JSON object with a `t` saying what it is. The site keeps a copy (its `yarn sync`).
 *
 * A page that says hello is sent the server's tables (`tables`), as the Dragon Raid lists its raids:
 * it joins one of them, or a new one, and sees it from then on (the bot's web/games/poker/table.ts),
 * but only plays once it sits down with some chips. (A player already at a table, seated or not, is
 * put back at it straight away.) A table full of members can't be joined; one with bots in it can: a
 * bot gets up for each member joining, once the hand it's in is over, and they watch until it has.
 * A page is only ever sent its own player's cards (and everyone's that are face up): nothing in it,
 * or its dev tools, gives anyone else's away. Poker can't be watched for the same reason.
 *
 *   page -> bot   hello    first message: the token from the link
 *                 tables   the server's tables again (`tables`)
 *                 join     joins table `table`, or a new one ('new')
 *                 leave    leaves the table they're at, not sitting at it, back to the tables
 *                 sit      sits down at `seat` (or the first free one) with `chips` from their balance
 *                 stand    stands up: their chips go back to their balance (straight away, or once the
 *                          hand they're in is over; they fold)
 *                 act      their move, on their turn: `amount` is what a raise (or bet) goes to, all
 *                          told this street; 'allIn' bets everything they have
 *                 bot      adds a bot in the first free seat (`add` true), or takes the bot in `seat`
 *                          away (after the hand it's in)
 *                 chat     says something to the table (./chat.ts, with what the bot sends back)
 *   bot -> page   tables   the server's tables (after hello, `tables` and `leave`, and with a refused `join`)
 *                 poker    the table as it is now: whenever anything about it changes
 *                 refused  something they asked couldn't be done, and why
 *                 error    and the bot closes the connection
 */

export type PokerMove = 'fold' | 'check' | 'call' | 'raise' | 'allIn';

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

/** What a player did last, for the table to show. */
export type PlayerMove =
  | { type: 'blind'; amount: number }
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call'; amount: number }
  | { type: 'bet'; to: number }
  | { type: 'raise'; to: number }
  | { type: 'allIn'; to: number };

export type ClientMessage =
  | { t: 'hello'; token: string }
  | { t: 'tables' }
  | { t: 'join'; table: number | 'new' }
  | { t: 'leave' }
  | { t: 'sit'; chips: number; seat?: number }
  | { t: 'stand' }
  | { t: 'act'; move: PokerMove; amount?: number }
  | { t: 'bot'; add: true }
  | { t: 'bot'; add: false; seat: number }
  | ChatClientMessage;

/** A player at the table (a member, or a bot). */
export interface SeatView {
  /** Where they sit, from 0. */
  seat: number;
  /** The member's id, or the bot's ("bot:1"). */
  id: string;
  name: string;
  /** Their profile picture (empty for a bot: the page draws one). */
  avatar: string;
  bot: boolean;
  /** Chips behind them (not in front of them this street, or in the pot). */
  chips: number;
  /** Chips in front of them this street. */
  bet: number;
  /** They were dealt into the hand being played. */
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  /** Their cards: only ever this page's own, or anyone's once they're face up (null otherwise, even when they hold some). */
  cards: Card[] | null;
  /** What they did last this street. */
  last: PlayerMove | null;
  /** Their page went away: their turns are played for them (check or fold) until they come back. */
  away: boolean;
  /** They'll get up once the hand they're in is over. */
  leaving: boolean;
}

/** A pot, once the hand is over: who won it and with what. */
export interface PotView {
  amount: number;
  /** The winners' seats. */
  seats: number[];
  /** The winning hand in words ("Full house, Kings over Sevens"), or null when nobody had to show. */
  hand: string | null;
}

export interface HandView {
  /** Counts up with every hand the table deals, so the page knows a new hand from one it has shown. */
  no: number;
  /** Who has the button (a seat). */
  button: number;
  street: Street;
  board: Card[];
  /** Every chip in the pot so far, what's in front of the players included. */
  pot: number;
  /** Whose turn it is (a seat), or null between betting rounds and once the hand is over. */
  toAct: number | null;
  /** What it takes to call: the most anyone has in front of them this street. */
  currentBet: number;
  /** Over: how it went. Null while it's being played. */
  result: {
    pots: PotView[];
    rake: number;
    /** What each seat won, by seat. */
    won: Record<number, number>;
    /** The hands shown down, by seat: the best five cards (to light up) and its name. */
    shown: Record<number, { best: Card[]; hand: string }>;
  } | null;
}

/** What this page's player may do on their turn. */
export interface YourMove {
  /** Checking is free. */
  check: boolean;
  /** What calling costs (0: nothing to call). */
  call: number;
  /** The least and most they can raise (or bet) to, all told this street, or null when they can't. */
  raise: { min: number; max: number } | null;
}

export interface PokerState {
  /** The table's number in the server, from 1. */
  table: number;
  /** This page's player. */
  you: string;
  /** Every seat, empty ones null. */
  seats: (SeatView | null)[];
  /** The hand being played, or the last one (while the next waits to be dealt); null before the first. */
  hand: HandView | null;
  /** What this page's player may do: only on their turn. */
  move: YourMove | null;
  /** Milliseconds left: of the turn being played, or until the next hand is dealt. 0 otherwise. */
  msLeft: number;
  /** 'waiting': fewer than two players with chips. 'next': the next hand is coming. 'playing'. */
  phase: 'waiting' | 'next' | 'playing';
  blinds: { small: number; big: number };
  buyIn: { min: number; max: number };
  rake: { rate: number; cap: number };
  /** This page's player's balance (to sit down with), as of their last look. */
  balance: number;
  /** A bot can be added: they're seated, under today's bot limit (`botWinnings`), and there's a free seat. */
  canAddBot: boolean;
  /**
   * What this page's player has won off the bots today, net (negative: lost to them), against the
   * most they may (`limit`). Once they have, the bots sit out of the hands they're in, and they
   * can't add one, until the next day. Null when they aren't seated, or there's no limit.
   */
  botWinnings: { won: number; limit: number } | null;
  turnSeconds: number;
}

export type ErrorCode =
  /** The link's token is wrong or too old (or the bot restarted since). */
  | 'bad_token'
  /** The page was opened somewhere else (another tab): only one plays at a time. */
  | 'replaced'
  /** A message that isn't one of the above, or too many of them. */
  | 'bad_message';

export type Refusal =
  /** The buy-in is outside the table's range. */
  | { reason: 'buy_in'; min: number; max: number }
  /** They don't have the points to sit down with that. */
  | { reason: 'too_poor'; balance: number }
  /** The seat they asked for is taken, or every seat is. */
  | { reason: 'seat_taken' }
  /** Not their turn, or a move they can't make (the page is out of date). */
  | { reason: 'not_now' }
  /** They have won the most they may off the bots today (PokerState.botWinnings). */
  | { reason: 'bot_limit'; limit: number }
  /** The table they asked to join is full of members (no bot to get up for them). */
  | { reason: 'table_full' }
  /** The table they asked to join has closed. */
  | { reason: 'no_table' }
  /** Something went wrong on the bot's side. */
  | { reason: 'failed' };

/** A table in the server, as the page lists them before joining one. */
export interface TableListing {
  /** Its number in the server, from 1. */
  table: number;
  /** The members sitting at it. */
  players: { name: string; avatar: string }[];
  /** How many bots sit at it (one gets up for each member joining, once the hand it's in is over). */
  bots: number;
  seats: number;
  /** A hand is being played. */
  playing: boolean;
  /** One more member can join: there's a free seat, or a bot to get up for them. */
  open: boolean;
}

export type ServerMessage =
  | { t: 'tables'; tables: TableListing[] }
  | { t: 'poker'; state: PokerState }
  | ({ t: 'refused' } & Refusal)
  | { t: 'error'; code: ErrorCode }
  | ChatServerMessage;
