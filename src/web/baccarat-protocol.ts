import type { BaccaratBet } from '../constants/index.js';
import type { Card } from '../lib/game/blackjack.js';
import { parseBets, type BaccaratBets, type BaccaratWinner, type BetOutcome } from '../lib/game/baccarat.js';

/*
 * What baccarat's web page (the Koma-UI repo) and the bot say to each other over the WebSocket.
 * Every message is one JSON object with a `t` saying what it is. The page keeps a copy of these
 * types (src/baccarat/protocol.ts there): change both together.
 *
 * A round is dealt all at once: the page sends its chips, the bot takes them, deals and pays, and
 * sends the whole round back for the page to deal out card by card.
 *
 *   page -> bot   hello    first message: the token from the link
 *                 deal     a round with these chips on the table; `seq` counts up from 1 with each
 *   bot -> page   table    the balance, what a round can be, the chips, and what each bet pays
 *                 round    a round dealt, after the page's deal `seq`
 *                 refused  a deal that couldn't happen, and why (nothing was taken)
 *                 error    and the bot closes the connection
 *
 * Watching (live.ts): a watch-only page says `watch` with the token from its watch link instead of
 * `hello`, and is then sent everything the player's page is sent about the game (not their errors),
 * starting with `watching` (whose game it is). `away` says the player's page went away (it may come
 * back). The player is sent `watchers` whenever how many are watching changes.
 */

export type ClientMessage = { t: 'hello'; token: string } | { t: 'watch'; token: string } | { t: 'deal'; bets: BaccaratBets; seq: number };

/** Everything the page needs to take bets. */
export interface Table {
  player: string;
  balance: number;
  /** The smallest and biggest round, counting every chip on the table. */
  minBet: number;
  maxBet: number;
  /** The chips to bet with, smallest first. */
  chips: number[];
  /** What each winning bet pays, to 1. */
  payouts: Record<BaccaratBet, number>;
  /** The chips of the round played last on this page, to bet the same again. */
  lastBets: BaccaratBets | null;
}

/** A round dealt, as the page shows it. */
export interface RoundView {
  player: Card[];
  banker: Card[];
  /** Who each card went to, in the order dealt (Player, Banker, Player, Banker, then any third cards). */
  order: ('player' | 'banker')[];
  playerTotal: number;
  bankerTotal: number;
  winner: BaccaratWinner;
  natural: boolean;
  bets: { spot: BaccaratBet; amount: number; outcome: BetOutcome; returned: number }[];
  bet: number;
  payout: number;
  net: number;
  balance: number;
}

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

export type DealRefusal =
  /** Every chip together is out of the bet range (`limit` is the end it broke). */
  | { reason: 'too_small' | 'too_big'; limit: number }
  /** More than they have. */
  | { reason: 'too_poor'; balance: number }
  /** A round is still being dealt, or came too soon after the last. */
  | { reason: 'busy' };

export type ServerMessage =
  | { t: 'table'; table: Table }
  | { t: 'round'; seq: number; round: RoundView }
  | ({ t: 'refused'; seq: number } & DealRefusal)
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
  if ((m.t === 'hello' || m.t === 'watch') && typeof m.token === 'string' && m.token.length <= 512) return { t: m.t, token: m.token };
  if (m.t === 'deal' && typeof m.seq === 'number' && Number.isSafeInteger(m.seq) && m.seq > 0) {
    const bets = parseBets(m.bets);
    return bets ? { t: 'deal', bets, seq: m.seq } : null;
  }
  return null;
}
