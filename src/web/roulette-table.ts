import { CONFIG } from '../config.js';
import { ROULETTE_TABLE, ROULETTE_WEB, TABLE_CHIPS } from '../constants/index.js';
import { parseBets, spin, type RouletteRound, type RouletteSpot } from '../lib/game/roulette.js';
import { playRoulette } from '../services/economy/index.js';
import { PartyTables, realBaseDeps, type PartyGame, type PartyTable, type TableDeps as PartyTableDeps } from './party-table.js';
import type { RouletteExtras, RouletteRoundView } from './roulette-protocol.js';

/*
 * Roulette's shared tables: the shared-table machinery (party-table.ts, like baccarat's), with
 * roulette's round (one spin of the wheel, settled by services/economy/roulette.ts) and the table's
 * last numbers.
 */

export type { Peer } from './party-table.js';
export type TableDeps = PartyTableDeps<RouletteSpot, RouletteRound>;
export type RouletteTable = PartyTable<RouletteSpot, RouletteRound, RouletteRoundView, RouletteExtras>;

const COLOR_NAME = { red: 'Red', black: 'Black', green: 'Green' } as const;

export const rouletteGame: PartyGame<RouletteSpot, RouletteRound, RouletteRoundView, RouletteExtras> = {
  live: 'roulette',
  table: ROULETTE_TABLE,
  web: ROULETTE_WEB,
  chips: TABLE_CHIPS,
  limits: () => CONFIG.roulette,
  parseBets,
  view: (round, previous) => ({
    number: round.number,
    color: round.color,
    recent: [round.number, ...(previous?.recent ?? [])].slice(0, ROULETTE_TABLE.recent),
  }),
  extras: () => ({}),
  outcome: (round) => `${round.number} ${COLOR_NAME[round.color]}`,
};

export const realTableDeps: TableDeps = { ...realBaseDeps, play: playRoulette, deal: () => spin() };

export const rouletteTables = new PartyTables(rouletteGame, realTableDeps);

/** The tables open in a server. */
export const tablesIn = (guildId: string): readonly RouletteTable[] => rouletteTables.in(guildId);

/** For tests: forgets every table. */
export const resetTables = (): void => rouletteTables.reset();
