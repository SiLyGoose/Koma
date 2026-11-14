/*
 * What minesweeper's web page (the Koma-UI repo) and the bot say to each other over the WebSocket.
 * Every message is one JSON object with a `t` saying what it is. The site keeps a copy (its `yarn sync`).
 *
 * A server has one room (the bot's web/games/minesweeper/room.ts): everyone opening minesweeper there plays the
 * same board. The bot holds it, and a page is only ever told what has been opened, so nothing in the
 * page (or its dev tools) gives away where the mines are until the board is lost. A board cleared
 * pays its level's pool of points (`rewards`), more for being quick, shared between everyone who
 * opened its tiles by how many each opened (`paid`). The fastest clears of each level in the server
 * are kept, with who cleared them (`best`).
 *
 *   page -> bot   hello    first message: the token from the link
 *                 new      a new board at `level`, in place of the one there
 *                 open     opens tile `index` (row by row from the top left)
 *                 flag     puts a flag on tile `index`, or takes it off
 *                 chord    on an open tile with as many flags round it as its number: opens the rest round it
 *                 cursor   where this page's mouse is over the board, in tiles from its top left
 *                          (2.5 across is the middle of the third column), or null once it's off it
 *                 chat     says something to the room (./chat.ts, with what the bot sends back)
 *   bot -> page   room     the room as it is now: whenever anything about it changes
 *                 best     the server's fastest clears of each level: on joining, and whenever a clear makes them
 *                 cursor   where another player's mouse is (never this page's own), or null
 *                 error    and the bot closes the connection
 */
/** The boards, easiest first (the classic three: how big each is, the bot's constants/minesweeper.ts). */
export const MINESWEEPER_LEVEL_IDS = ['easy', 'medium', 'hard'];
//# sourceMappingURL=minesweeper.js.map