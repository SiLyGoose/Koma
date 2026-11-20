import type * as table from './table.js';

/*
 * What the duck race's web page (the Koma-UI repo) and the bot say to each other: the shared tables'
 * messages (./table.ts), with the ducks as the spots, its round (the race run), and what a winning
 * duck pays. The site keeps a copy (its `yarn sync`).
 */

/** The ducks in every race, in their lanes from the top: the spots a bet goes on. */
export const DUCK_IDS = ['yellow', 'red', 'blue', 'green'] as const;
export type Duck = (typeof DUCK_IDS)[number];

/** Each duck's name and colour, as the page draws it and the bot names it. */
export const DUCKS: Readonly<Record<Duck, { name: string; color: string }>> = {
  yellow: { name: 'Yarl', color: '#f7c948' },
  red: { name: 'Erlaf', color: '#e5484d' },
  blue: { name: 'Faruk', color: '#3e8ef7' },
  green: { name: 'Jabin', color: '#46b35f' },
};

/** A race run. */
export interface DuckRaceRoundView {
  winner: Duck;
  /** Every duck, in the order they finished (the winner first). */
  order: Duck[];
  /**
   * When each duck passes each mark down the course (DUCK_RACE_MARKS of them, evenly spaced; the
   * last is the finish), as a share of the race's time: the last duck home finishes at 1. The page
   * moves each duck evenly between its marks, so every page shows the same race.
   */
  splits: Record<Duck, number[]>;
  /** The table's last winners, this one first (up to DUCK_RACE_TABLE.recent). */
  recent: Duck[];
}

/** What the duck race adds to the table: what a winning duck pays, to 1. */
export interface DuckRaceExtras {
  payout: number;
}

export type ClientMessage = table.ClientMessage<Duck>;
export type SeatView = table.SeatView<Duck>;
export type RoundView = table.RoundOf<DuckRaceRoundView>;
export type TableState = table.TableState<Duck, DuckRaceRoundView, DuckRaceExtras>;
export type ServerMessage = table.ServerMessage<Duck, DuckRaceRoundView, DuckRaceExtras>;
