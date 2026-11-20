/*
 * What Hot Potato's web page (the Koma-UI repo) and the bot say to each other over the WebSocket. Every message is one
 * JSON object with a `t` saying what it is. The site keeps a copy (its `yarn sync`).
 *
 * Hot Potato is a random event (the bot's events/games/hot-potato.ts): players join, then potatoes with a hidden fuse
 * go round. The holder presses Pass to toss it to another player at random; anyone else pressing Pass grabs it, and a
 * player's presses count at most once every `gapMs`. Whoever holds a potato when it goes off is out and pays a fine;
 * those left when the last one has gone off split the prize. It is played in Discord (its buttons) and on this page
 * alike, the one game. Everything about it is public, so every page in the server is told the same game; one that
 * didn't join in time watches it. With no Hot Potato going, the page shows how the last
 * one ended, and waits for the next.
 *
 * The page's holder can pass to someone they pick (`pass` with `to`, their picture pressed); Discord's button, and Pass
 * on the page, toss it to someone at random.
 *
 *   page -> bot   hello      first message: the token from the link (or `watch`, with a watch link's: see connection.ts)
 *                 join       joins the game while it's open for joining
 *                 pass       presses Pass (holding it, `to`: to that player, if still in)
 *                 react      a reaction (./reactions.ts), from a watcher's page too
 *   bot -> page   state      the game as it is now: whenever anything about it changes
 *                 answer     what came of the page's join or pass
 *                 reaction   someone's reaction
 *                 error      and the bot closes the connection
 */
/** How many of the last moves a game's trail keeps. */
export const POTATO_TRAIL = 40;
//# sourceMappingURL=potato.js.map