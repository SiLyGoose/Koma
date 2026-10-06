import { CONFIG } from '../../../config.js';
import { BACCARAT_CHIPS, BACCARAT_TABLE, BACCARAT_WEB, type BaccaratBet } from '../../../constants/index.js';
import { dealRound, parseBets, type BaccaratRound } from '../../../lib/game/casino/baccarat.js';
import { playBaccarat } from '../../../services/economy/index.js';
import type { BaccaratExtras, BaccaratRoundView } from './protocol.js';
import { PartyTables, realBaseDeps, type PartyGame, type PartyTable, type TableDeps as PartyTableDeps } from '../table/table.js';

/*
 * Baccarat's shared tables: the shared-table machinery (web/games/table/table.ts), with baccarat's round (the
 * two hands, settled by services/casino/baccarat.ts) and what each spot pays.
 */

export type { Peer } from '../table/table.js';
export type TableDeps = PartyTableDeps<BaccaratBet, BaccaratRound>;
export type BaccaratTable = PartyTable<BaccaratBet, BaccaratRound, BaccaratRoundView, BaccaratExtras>;

const WINNER_CODE = { player: 'P', banker: 'B', tie: 'T' } as const;

/** One hand for the scoreboard (see BaccaratRoundView.history): like "B7pn". A pair is the first two cards of a hand being the same rank. */
export function handCode(round: BaccaratRound): string {
  const total = round.winner === 'player' ? round.playerTotal : round.bankerTotal;
  const pair = (cards: BaccaratRound['player']): boolean => cards.length >= 2 && cards[0]!.rank === cards[1]!.rank;
  return `${WINNER_CODE[round.winner]}${total}${pair(round.player) ? 'p' : ''}${pair(round.banker) ? 'b' : ''}${round.natural ? 'n' : ''}`;
}

/** The scoreboard a new hand goes on: a full one is cleared, like a casino's with each new shoe. */
const board = (history: readonly string[]): readonly string[] => (history.length >= BACCARAT_TABLE.history ? [] : history);

export const baccaratGame: PartyGame<BaccaratBet, BaccaratRound, BaccaratRoundView, BaccaratExtras> = {
  live: 'baccarat',
  table: BACCARAT_TABLE,
  web: BACCARAT_WEB,
  chips: BACCARAT_CHIPS,
  limits: () => CONFIG.baccarat,
  parseBets,
  view: (round, previous) => ({
    player: round.player,
    banker: round.banker,
    order: round.order,
    playerTotal: round.playerTotal,
    bankerTotal: round.bankerTotal,
    winner: round.winner,
    natural: round.natural,
    history: [...board(previous?.history ?? []), handCode(round)],
  }),
  extras: () => ({ payouts: { player: 1, ...CONFIG.baccarat.payout } }),
  outcome: (round) => (round.winner === 'tie' ? 'Tie' : `${round.winner === 'player' ? 'Player' : 'Banker'} wins`),
};

export const realTableDeps: TableDeps = { ...realBaseDeps, play: playBaccarat, deal: () => dealRound() };

export const baccaratTables = new PartyTables(baccaratGame, realTableDeps);

/** The tables open in a server. */
export const tablesIn = (guildId: string): readonly BaccaratTable[] => baccaratTables.in(guildId);

/** For tests: forgets every table. */
export const resetTables = (): void => baccaratTables.reset();
