import type { WebSocket } from 'ws';
import { baccaratTables, realTableDeps, type Peer, type TableDeps } from './baccarat-table.js';
import { openTableConnection, serveTable, type TableConnection } from './table-server.js';

/*
 * The web socket baccarat's page plays through: the shared tables' (table-server.ts), seating
 * players at baccarat's tables.
 */

export type { Peer } from './baccarat-table.js';
export type { TableConnection } from './table-server.js';

/** Plays baccarat with the page `page`. */
export const openConnection = (page: Peer, deps: TableDeps = realTableDeps): TableConnection => openTableConnection(baccaratTables, page, deps);

/** Plays baccarat over a web socket just opened. `avatar` is the member's profile picture in the server, when the bot knows it. */
export const serveBaccarat = (socket: WebSocket, avatar?: TableDeps['avatar']): void => serveTable(baccaratTables, socket, avatar);
