import type { WebSocket } from 'ws';
import { realTableDeps, rouletteTables, type Peer, type TableDeps } from './roulette-table.js';
import { openTableConnection, serveTable, type TableConnection } from './table-server.js';

/*
 * The web socket roulette's page plays through: the shared tables' (table-server.ts), seating
 * players at roulette's tables.
 */

export type { Peer } from './roulette-table.js';

/** Plays roulette with the page `page`. */
export const openConnection = (page: Peer, deps: TableDeps = realTableDeps): TableConnection => openTableConnection(rouletteTables, page, deps);

/** Plays roulette over a web socket just opened. `avatar` is the member's profile picture in the server, when the bot knows it. */
export const serveRoulette = (socket: WebSocket, avatar?: TableDeps['avatar']): void => serveTable(rouletteTables, socket, avatar);
