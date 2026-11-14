import type * as table from './table.js';

/*
 * What roulette's web page (the Koma-UI repo) and the bot say to each other: the shared tables'
 * messages (./table.ts), with roulette's spots (the bot's lib/game/casino/roulette.ts names them) and its round
 * (where the ball landed). The site keeps a copy (its `yarn sync`).
 */

export type RouletteColor = 'red' | 'black' | 'green';

/** A pocket on the wheel: 0 to 36, or 00. */
export type RoulettePocket = number | '00';

/** A spot's name: an outside bet, or the numbers an inside bet covers (the bot's lib/game/casino/roulette.ts). */
export type RouletteSpot = string;

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
