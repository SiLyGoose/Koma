import { baccaratTables, realTableDeps } from './table.js';
import { openTableConnection, serveTable } from '../table/server.js';
/** Plays baccarat with the page `page`. */
export const openConnection = (page, deps = realTableDeps) => openTableConnection(baccaratTables, page, deps);
/** Plays baccarat over a web socket just opened. `avatar` is the member's profile picture in the server, when the bot knows it. */
export const serveBaccarat = (socket, avatar) => serveTable(baccaratTables, socket, avatar);
//# sourceMappingURL=server.js.map