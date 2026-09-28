import { CONFIG } from '../config.js';
import { BACCARAT_CHIPS, BACCARAT_TABLE, BACCARAT_WEB, type BaccaratBet } from '../constants/index.js';
import { dealRound, parseBets, type BaccaratRound } from '../lib/game/baccarat.js';
import { playBaccarat } from '../services/economy/index.js';
import type { BaccaratExtras, BaccaratRoundView } from './baccarat-protocol.js';
import { PartyTables, realBaseDeps, type PartyGame, type PartyTable, type TableDeps as PartyTableDeps } from './party-table.js';

/*
 * Baccarat's shared tables: the shared-table machinery (party-table.ts), with baccarat's round (the
 * two hands, settled by services/economy/baccarat.ts) and what each spot pays.
 */

export type { Peer } from './party-table.js';
export type TableDeps = PartyTableDeps<BaccaratBet, BaccaratRound>;
export type BaccaratTable = PartyTable<BaccaratBet, BaccaratRound, BaccaratRoundView, BaccaratExtras>;

export const baccaratGame: PartyGame<BaccaratBet, BaccaratRound, BaccaratRoundView, BaccaratExtras> = {
  live: 'baccarat',
  table: BACCARAT_TABLE,
  web: BACCARAT_WEB,
  chips: BACCARAT_CHIPS,
  limits: () => CONFIG.baccarat,
  parseBets,
  view: (round) => ({
    player: round.player,
    banker: round.banker,
    order: round.order,
    playerTotal: round.playerTotal,
    bankerTotal: round.bankerTotal,
    winner: round.winner,
    natural: round.natural,
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
