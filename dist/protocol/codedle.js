/*
 * What Codedle's web page (the Koma-UI repo) and the bot say to each other over the WebSocket. Every message is one
 * JSON object with a `t` saying what it is. The site keeps a copy (its `yarn sync`).
 *
 * Codedle is a random event (the bot's events/games/codedle.ts): the vault is locked with a code of `length` digits, and
 * the first to guess it takes the prize. Guessing opens a while after it's announced (`opensAt`), for everyone to get here. It is played in Discord (its Guess pop-up) and on this page alike, the one game:
 * each guess costs its fee, and is scored Wordle-style. A page is told only its own player's guesses and hints while the
 * vault is locked (and how many guesses everyone has made); once it is cracked, or time runs out, the code and everyone's
 * guesses. With no Codedle going, the page shows how the last one in the server ended, and waits for the next.
 *
 *   page -> bot   hello    first message: the token from the link
 *                 guess    a guess of `length` digits; `seq` counts up from 1 with every guess
 *   bot -> page   state    the game as it is now, for this player: whenever anything about it changes
 *                 answer   what came of the page's guess `seq`: its hint, or why it wasn't taken (nothing was charged)
 *                 error    and the bot closes the connection
 */
export {};
//# sourceMappingURL=codedle.js.map