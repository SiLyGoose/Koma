import type { BaccaratBet } from '../constants/index.js';
import type { Card } from '../lib/game/blackjack.js';
import { parseBets, type BaccaratWinner } from '../lib/game/baccarat.js';
import * as table from './table-protocol.js';

/*
 * What baccarat's web page (the Koma-UI repo) and the bot say to each other: the shared tables'
 * messages (table-protocol.ts), with baccarat's spots, its round (the two hands), and what each spot
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
export type { BetRefusal, ErrorCode } from './table-protocol.js';

/** Reads a message from the page. Null when it isn't a valid one. */
export const parseClientMessage = (text: string): ClientMessage | null => table.parseTableMessage(text, parseBets);
