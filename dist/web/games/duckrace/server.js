import { duckRaceTables, realTableDeps } from './table.js';
import { openTableConnection, serveTable } from '../table/server.js';
/** Plays the duck race with the page `page`. */
export const openConnection = (page, deps = realTableDeps) => openTableConnection(duckRaceTables, page, deps);
/** Plays the duck race over a web socket just opened. `avatar` is the member's profile picture in the server, when the bot knows it. */
export const serveDuckRace = (socket, avatar) => serveTable(duckRaceTables, socket, avatar);
//# sourceMappingURL=server.js.map