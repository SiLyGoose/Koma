/*
 * What the mine's web page (the Koma-UI repo) and the bot say to each other over the WebSocket.
 * Every message is one JSON object with a `t` saying what it is. The site keeps a copy (its `yarn sync`).
 *
 * The bot holds the board. The page is only ever told what has been turned over, so nothing in the
 * page (or its dev tools) gives away where the mines are; the whole board is shown once the round is over.
 *
 * A link lets one member play (the bot's web/auth/token.ts): it opens their round if one is going, and the lobby
 * otherwise, where they can start a new one.
 *
 *   page -> bot   hello    first message: the token from the link
 *                 start    a new round with this bet and this many mines (from the lobby)
 *                 pick     turn over tile `index` (0 to 24, row by row from the top left), or a random one
 *                 cashout
 *                 `seq` counts up from 1 with every start, pick or cash out
 *   bot -> page   lobby    no round going: the balance, what a bet can be, and how the multipliers work
 *                 state    the round as it is now, after the page's message `seq` (0: not after one)
 *                 refused  a start that couldn't happen, and why (nothing was taken)
 *                 error    and the bot closes the connection
 *
 * Watching (the bot's web/games/live.ts): a watch-only page says `watch` with the token from its watch link instead of
 * `hello`, and is then sent everything the player's page is sent about the game (not their errors),
 * starting with `watching` (whose game it is) and the game as it is. `away` says the player's page
 * went away (it may come back). The player is sent `watchers` whenever how many are watching changes.
 */
export {};
//# sourceMappingURL=mines.js.map