import { realTableDeps, rouletteTables } from './table.js';
import { openTableConnection, serveTable } from '../table/server.js';
/** Plays roulette with the page `page`. */
export const openConnection = (page, deps = realTableDeps) => openTableConnection(rouletteTables, page, deps);
/** Plays roulette over a web socket just opened. `avatar` is the member's profile picture in the server, when the bot knows it. */
export const serveRoulette = (socket, avatar) => serveTable(rouletteTables, socket, avatar);
//# sourceMappingURL=server.js.map