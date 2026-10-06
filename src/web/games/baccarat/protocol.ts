import type { BaccaratBet } from '../../../constants/index.js';
import type { Card } from '../../../lib/game/casino/blackjack.js';
import { parseBets, type BaccaratWinner } from '../../../lib/game/casino/baccarat.js';
import * as table from '../table/protocol.js';

/*
 * What baccarat's web page (the Koma-UI repo) and the bot say to each other: the shared tables'
 * messages (web/games/table/protocol.ts), with baccarat's spots, its round (the two hands), and what each spot
 * pays. The page keeps a copy of these types (src/baccarat/protocol.ts there): change both together.
 */

/** The hands of a round dealt. */
export interface BaccaratRoundView {
  player: Card[];
  banker: Card[];
  /** Who each card went to, in the order dealt (Player, Banker, Player, Banker, then any third cards). */
  order: ('player' | 'banker')[];
  playerTotal: number;
  bankerTotal: number;
  winner: BaccaratWinner;
  natural: boolean;
  /**
   * The table's hands on the scoreboard, oldest first and this one last, for the scoreboard. It
   * holds up to BACCARAT_TABLE.history; once full, the next hand starts a clean one (a new shoe). Each is a short code (see handCode in table.ts): who won ('P', 'B' or 'T'), the
   * winning total (a tie's total), then 'p' for a player pair, 'b' for a banker pair and 'n' for a
   * natural, in that order, when they happened. "B7pn": Banker won with 7, a player pair, a natural.
   */
  history: string[];
}

/** What baccarat adds to the table: what each spot pays, to 1. */
export interface BaccaratExtras {
  payouts: Record<BaccaratBet, number>;
}

export type ClientMessage = table.ClientMessage<BaccaratBet>;
export type SettledView = table.SettledView<BaccaratBet>;
export type SeatView = table.SeatView<BaccaratBet>;
export type RoundView = table.RoundOf<BaccaratRoundView>;
export type TableState = table.TableState<BaccaratBet, BaccaratRoundView, BaccaratExtras>;
export type ServerMessage = table.ServerMessage<BaccaratBet, BaccaratRoundView, BaccaratExtras>;
export type { BetRefusal, ErrorCode } from '../table/protocol.js';

/** Reads a message from the page. Null when it isn't a valid one. */
export const parseClientMessage = (text: string): ClientMessage | null => table.parseTableMessage(text, parseBets);
