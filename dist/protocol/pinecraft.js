/*
 * What Pinecraft's web page (the Koma-UI repo) and the bot say to each other over the WebSocket.
 * Every message is one JSON object with a `t` saying what it is. The site keeps a copy (its `yarn sync`).
 *
 * The bot holds the world. The page is sent the rows around the miner, with only the ores the miner
 * can see in them (see viewRows in the bot's lib/game/pinecraft.ts).
 *
 *   page -> bot   hello    first message: the token from the link
 *                 mine     starts breaking the block that way (no answer)
 *                 map      asks for the map of everything uncovered
 *                 move     one step; `seq` counts up from 1 with every move. Into a block, it finishes
 *                          breaking it: the bot holds the move until the block's break time has
 *                          passed since its `mine` (or since now, without one)
 *   bot -> page   state    the world around the miner, after the page's move `seq` (0: not after one; -1: the member's gear changed)
 *                 map      the map asked for
 *                 error    and the bot closes the connection
 *
 * Watching (the bot's web/games/live.ts): a watch-only page says `watch` with the token from its watch link instead of
 * `hello`, and is then sent everything the player's page is sent about the game (not their errors),
 * starting with `watching` (whose game it is) and the game as it is. `away` says the player's page
 * went away (it may come back). The player is sent `watchers` whenever how many are watching changes.
 * A watcher can ask for the player's `map` too, and is sent `breaking` when the player starts on a block.
 */
/** The ores, from the most common and least valuable to the rarest. */
export const PINECRAFT_ORES = ['coal', 'iron', 'gold', 'diamond', 'emerald', 'amethyst', 'ruby'];
//# sourceMappingURL=pinecraft.js.map