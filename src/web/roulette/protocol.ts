import { parseBets, type RouletteColor, type RoulettePocket, type RouletteSpot } from '../../lib/game/casino/roulette.js';
import * as table from '../table/protocol.js';

/*
 * What roulette's web page (the Koma-UI repo) and the bot say to each other: the shared tables'
 * messages (web/table/protocol.ts), with roulette's spots (lib/game/casino/roulette.ts names them) and its round
 * (where the ball landed). The page keeps a copy of these types (src/roulette/protocol.ts there):
 * change both together.
 */

/** Where the ball landed in a round spun. */
export interface RouletteRoundView {
  /** 0 to 36, or '00'. */
  number: RoulettePocket;
  color: RouletteColor;
  /** The table's last numbers, this one first (up to ROULETTE_TABLE.recent). */
  recent: RoulettePocket[];
}

/** Roulette adds nothing to the table: what a spot pays follows from how many numbers it covers. */
export type RouletteExtras = Record<never, never>;

export type ClientMessage = table.ClientMessage<RouletteSpot>;
export type SeatView = table.SeatView<RouletteSpot>;
export type RoundView = table.RoundOf<RouletteRoundView>;
export type TableState = table.TableState<RouletteSpot, RouletteRoundView, RouletteExtras>;
export type ServerMessage = table.ServerMessage<RouletteSpot, RouletteRoundView, RouletteExtras>;

/** Reads a message from the page. Null when it isn't a valid one. */
export const parseClientMessage = (text: string): ClientMessage | null => table.parseTableMessage(text, parseBets);
