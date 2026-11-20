import { CONFIG } from '../../../config.js';
import { DUCK_RACE_TABLE, DUCK_RACE_WEB, DUCKS, TABLE_CHIPS } from '../../../constants/index.js';
import { parseBets, race, type Duck, type DuckRaceRound } from '../../../lib/game/casino/duckrace.js';
import { playDuckRace } from '../../../services/economy/index.js';
import { PartyTables, realBaseDeps, type PartyGame, type PartyTable, type TableDeps as PartyTableDeps } from '../table/table.js';
import type { DuckRaceExtras, DuckRaceRoundView } from './protocol.js';

/*
 * The duck race's shared tables: the shared-table machinery (web/games/table/table.ts, like roulette's),
 * with the duck race's round (one race, settled by services/casino/duckrace.ts) and the table's last
 * winners.
 */

export type { Peer } from '../table/table.js';
export type TableDeps = PartyTableDeps<Duck, DuckRaceRound>;
export type DuckRaceTable = PartyTable<Duck, DuckRaceRound, DuckRaceRoundView, DuckRaceExtras>;

export const duckRaceGame: PartyGame<Duck, DuckRaceRound, DuckRaceRoundView, DuckRaceExtras> = {
  live: 'duckrace',
  table: DUCK_RACE_TABLE,
  web: DUCK_RACE_WEB,
  chips: TABLE_CHIPS,
  limits: () => CONFIG.duckRace,
  parseBets,
  view: (round, previous) => ({
    winner: round.winner,
    order: round.order,
    splits: round.splits,
    recent: [round.winner, ...(previous?.recent ?? [])].slice(0, DUCK_RACE_TABLE.recent),
  }),
  extras: () => ({ payout: CONFIG.duckRace.payout }),
  outcome: (round) => `${DUCKS[round.winner].name} wins`,
};

export const realTableDeps: TableDeps = { ...realBaseDeps, play: playDuckRace, deal: () => race() };

export const duckRaceTables = new PartyTables(duckRaceGame, realTableDeps);

/** The tables open in a server. */
export const tablesIn = (guildId: string): readonly DuckRaceTable[] => duckRaceTables.in(guildId);

/** For tests: forgets every table. */
export const resetTables = (): void => duckRaceTables.reset();
