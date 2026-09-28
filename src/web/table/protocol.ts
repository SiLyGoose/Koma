import type { BetOutcome, SpotBets } from '../../lib/game/casino/table-bets.js';

/*
 * What a shared-table game's web page (baccarat, roulette: the Koma-UI repo) and the bot say to each
 * other over the WebSocket. Every message is one JSON object with a `t` saying what it is. The page
 * keeps a copy of these types (src/table/protocol.ts there): change both together. Each game fills
 * in its own spots (`S`), round (`R`) and extras on the table (`X`): see web/baccarat/protocol.ts and
 * web/roulette/protocol.ts.
 *
 * The game is played at shared tables (web/table/table.ts): up to the game's `seats` players, one
 * round dealt for all of them every time. Each round has a betting time; the chips each player puts
 * down are shown to everyone at the table as they go down, and when the time is up the round is
 * dealt and everyone with chips down is settled on their own bets.
 *
 *   page -> bot   hello    first message: the token from the link (it is then seated at a table)
 *                 bets     the player's chips on the table now (all of them; {} takes them all back),
 *                          while the round is taking bets; `seq` counts up from 1 with each
 *                 deal     the player's vote to deal now (`ready` false takes it back): the round is
 *                          dealt as soon as everyone at the table has voted, if anyone has chips down
 *   bot -> page   table    the table as it is now: whenever anything about it changes
 *                 refused  chips that couldn't go down, and why (the table that follows says what's down)
 *                 error    and the bot closes the connection
 *
 * Watching (live.ts): a watch-only page says `watch` with the token from its watch link instead of
 * `hello`, and is then sent everything the player's page is sent (the table as they see it), starting
 * with `watching` (whose game it is). `away` says the player's page went away (it may come back).
 * The player is sent `watchers` whenever how many are watching changes.
 */

export type ClientMessage<S extends string = string> =
  | { t: 'hello'; token: string }
  | { t: 'watch'; token: string }
  | { t: 'bets'; bets: SpotBets<S>; seq: number }
  | { t: 'deal'; ready: boolean };

/** One bet of a player's in a round, and how it came out. */
export interface SettledView<S extends string = string> {
  spot: S;
  amount: number;
  outcome: BetOutcome;
  returned: number;
}

/** How the round just dealt went for a player. */
export interface SeatResult<S extends string = string> {
  bets: SettledView<S>[];
  bet: number;
  payout: number;
  net: number;
}

/** A player at the table. */
export interface SeatView<S extends string = string> {
  userId: string;
  name: string;
  /** Their Discord profile picture. */
  avatar: string;
  /** Their points, as of their last round (or sitting down). */
  balance: number;
  /** Their chips on the table this round (while betting; what they bet, once it's dealt). */
  bets: SpotBets<S>;
  /** How the round just dealt went for them: null while betting, or if they had no chips down. */
  result: SeatResult<S> | null;
  /** Their chips couldn't be taken when the round was dealt (they didn't have enough by then). */
  refused: boolean;
  /** Their chips of the last round they played, to bet the same again. */
  lastBets: SpotBets<S> | null;
  /** They voted to deal this round now (see the `deal` message). */
  ready: boolean;
}

/** A round dealt: `no` counts up with each round the table deals, so the page knows a new one from one it has shown. */
export type RoundOf<R> = { no: number } & R;

export type TableState<S extends string = string, R = unknown, X = unknown> = {
  /** The table's number in the server, from 1. */
  table: number;
  /** Which seat is the one this page plays (the player's, for someone watching them). */
  you: string;
  /** The players, in the order they sat down. */
  seats: SeatView<S>[];
  /** 'betting': chips can go down until the time is up. 'dealing': the round is being shown. */
  phase: 'betting' | 'dealing';
  /** Milliseconds until the phase ends. */
  msLeft: number;
  /** The round being shown while dealing (and the last one dealt while betting; null before the first). */
  round: RoundOf<R> | null;
  minBet: number;
  maxBet: number;
  maxSeats: number;
  chips: number[];
} & X;

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

export type BetRefusal =
  /** Every chip together is more than a round can have (`limit`). */
  | { reason: 'too_big'; limit: number }
  /** More than they have. */
  | { reason: 'too_poor'; balance: number }
  /** The round isn't taking bets any more (it's being dealt). */
  | { reason: 'closed' };

export type ServerMessage<S extends string = string, R = unknown, X = unknown> =
  | { t: 'table'; state: TableState<S, R, X> }
  | ({ t: 'refused'; seq: number } & BetRefusal)
  | { t: 'error'; code: ErrorCode }
  | { t: 'watching'; player: string }
  | { t: 'watchers'; count: number }
  | { t: 'away' };

/** Reads a message from the page, its chips by `parseBets`. Null when it isn't a valid one. */
export function parseTableMessage<S extends string>(text: string, parseBets: (data: unknown) => SpotBets<S> | null): ClientMessage<S> | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  if ((m.t === 'hello' || m.t === 'watch') && typeof m.token === 'string' && m.token.length <= 512) return { t: m.t, token: m.token };
  if (m.t === 'bets' && typeof m.seq === 'number' && Number.isSafeInteger(m.seq) && m.seq > 0) {
    const bets = parseBets(m.bets);
    return bets ? { t: 'bets', bets, seq: m.seq } : null;
  }
  if (m.t === 'deal' && typeof m.ready === 'boolean') return { t: 'deal', ready: m.ready };
  return null;
}
