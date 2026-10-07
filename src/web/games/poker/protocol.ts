import type { Card } from '../../../lib/game/casino/blackjack.js';
import type { PlayerMove, Street } from '../../../lib/game/casino/poker/hand.js';

/*
 * What poker's web page (the Koma-UI repo) and the bot say to each other over the WebSocket. Every
 * message is one JSON object with a `t` saying what it is. The page keeps a copy of these types
 * (src/poker/protocol.ts there): change both together.
 *
 * A page joins a table (web/games/poker/table.ts) as soon as it says hello, and sees it from then on,
 * but only plays once it sits down with some chips. A page is only ever sent its own player's cards
 * (and everyone's that are face up): nothing in it, or its dev tools, gives anyone else's away. Poker
 * can't be watched for the same reason.
 *
 *   page -> bot   hello    first message: the token from the link
 *                 sit      sits down at `seat` (or the first free one) with `chips` from their balance
 *                 stand    stands up: their chips go back to their balance (straight away, or once the
 *                          hand they're in is over; they fold)
 *                 act      their move, on their turn: `amount` is what a raise (or bet) goes to, all
 *                          told this street; 'allIn' bets everything they have
 *                 bot      adds a bot in the first free seat (`add` true), or takes the bot in `seat`
 *                          away (after the hand it's in)
 *   bot -> page   poker    the table as it is now: whenever anything about it changes
 *                 refused  something they asked couldn't be done, and why
 *                 error    and the bot closes the connection
 */

export type PokerMove = 'fold' | 'check' | 'call' | 'raise' | 'allIn';

export type ClientMessage =
  | { t: 'hello'; token: string }
  | { t: 'sit'; chips: number; seat?: number }
  | { t: 'stand' }
  | { t: 'act'; move: PokerMove; amount?: number }
  | { t: 'bot'; add: true }
  | { t: 'bot'; add: false; seat: number };

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
  /** A bot can be added: they're seated and there's a free seat. */
  canAddBot: boolean;
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
  /** Something went wrong on the bot's side. */
  | { reason: 'failed' };

export type ServerMessage = { t: 'poker'; state: PokerState } | ({ t: 'refused' } & Refusal) | { t: 'error'; code: ErrorCode };

const MOVES: readonly PokerMove[] = ['fold', 'check', 'call', 'raise', 'allIn'];
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
  if (m.t === 'sit' && count(m.chips) && (m.seat === undefined || count(m.seat))) return { t: 'sit', chips: m.chips, ...(m.seat === undefined ? {} : { seat: m.seat }) };
  if (m.t === 'stand') return { t: 'stand' };
  if (m.t === 'act' && MOVES.includes(m.move as PokerMove) && (m.amount === undefined || count(m.amount))) {
    return { t: 'act', move: m.move as PokerMove, ...(m.amount === undefined ? {} : { amount: m.amount }) };
  }
  if (m.t === 'bot' && m.add === true) return { t: 'bot', add: true };
  if (m.t === 'bot' && m.add === false && count(m.seat)) return { t: 'bot', add: false, seat: m.seat };
  return null;
}
