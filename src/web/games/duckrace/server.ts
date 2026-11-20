import type { WebSocket } from 'ws';
import { duckRaceTables, realTableDeps, type Peer, type TableDeps } from './table.js';
import { openTableConnection, serveTable, type TableConnection } from '../table/server.js';

/*
 * The web socket the duck race's page plays through: the shared tables' (web/games/table/server.ts),
 * seating players at the duck race's tables.
 */

export type { Peer } from './table.js';

/** Plays the duck race with the page `page`. */
export const openConnection = (page: Peer, deps: TableDeps = realTableDeps): TableConnection => openTableConnection(duckRaceTables, page, deps);

/** Plays the duck race over a web socket just opened. `avatar` is the member's profile picture in the server, when the bot knows it. */
export const serveDuckRace = (socket: WebSocket, avatar?: TableDeps['avatar']): void => serveTable(duckRaceTables, socket, avatar);
