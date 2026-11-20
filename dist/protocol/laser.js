/*
 * What Laser Grid's web page (the Koma-UI repo) and the bot say to each other over the WebSocket. Every message is one
 * JSON object with a `t` saying what it is. The site keeps a copy (its `yarn sync`).
 *
 * Laser Grid is a random event (the bot's events/games/laser-grid.ts): players join, then play rounds. Each round shows
 * a row of `slots` buttons (phase `ready`); after a random wait the laser fires (phase `fire`) and one of them,
 * `duckSlot`, turns into Duck! (and from the second round, some others can be fake ducks, `decoys`: as green, but saying
 * something else). Everyone still in has `windowMs` to press Duck!. Pressing before it fires, pressing
 * another one or not pressing in time gets you caught (out, and fined). Only a player's first press in a round counts.
 * Those never caught split the prize. It is played in Discord (its buttons) and on this page alike, the one game.
 * Everything about it is public (where Duck! is only once it fires), so every page in the server is told the same game;
 * one that didn't join in time watches it.
 *
 * A press says the round and the phase the page was showing (`ready` buttons count as `wait`), so it is judged by the
 * screen the player saw; the time to duck is measured on the bot, from when the laser went out.
 *
 *   page -> bot   hello      first message: the token from the link (or `watch`, with a watch link's: see connection.ts)
 *                 join       joins the game while it's open for joining
 *                 press      presses slot `slot` of round `round`, as shown in `phase`
 *                 react      a reaction (./reactions.ts), from a watcher's page too
 *   bot -> page   state      the game as it is now: whenever anything about it changes
 *                 answer     what came of the page's join or press
 *                 reaction   someone's reaction
 *                 error      and the bot closes the connection
 */
export {};
//# sourceMappingURL=laser.js.map