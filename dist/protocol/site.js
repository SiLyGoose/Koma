/* The site's own calls to the bot: logging in, who is logged in and where they can play, who is on the site, watching them, and the Pinecraft leaderboard. */
/** The games on the site, each a page of its own (the bot's web/config.ts GAMES says where). */
export const GAME_IDS = ['mines', 'pinecraft', 'baccarat', 'roulette', 'poker', 'raid', 'minesweeper', 'technomagic', 'dragon', 'divine', 'codedle'];
/** The most members GET /api/friends lists (those on the site always, the rest as many as fit). */
export const FRIENDS_MOST = 150;
/** The games that can be watched (the raids too: getting ready, the fight and its result, as the player's page has them). */
export const WATCHABLE = ['mines', 'pinecraft', 'baccarat', 'roulette', 'technomagic', 'dragon', 'divine'];
/** The raids whose rooms others can join (the Divine Punishment Raid is solo only). */
export const JOINABLE = ['technomagic', 'dragon'];
//# sourceMappingURL=site.js.map