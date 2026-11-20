/*
 * The reactions beside a vault event played on the site (Hot Potato's and Laser Grid's pages): a row of emoji anyone
 * there can press, players, those already out and watchers alike, that float up over the game on every page in the
 * server. Nothing is kept: a reaction is said once, to the pages there then. The bot's web/games/site-event.ts sends
 * them on, at most one a person every REACTION_GAP_MS.
 *
 *   page -> bot   react      presses REACTIONS[emoji]
 *   bot -> page   reaction   someone pressed one (the page's own too): who, and whether they only watch someone there
 */
/** The reactions, in the order the pages show them. */
export const REACTIONS = ['😂', '😱', '🔥', '💀', '👏', '🥔'];
/** The shortest gap between a person's reactions that are sent on (ms). */
export const REACTION_GAP_MS = 600;
//# sourceMappingURL=reactions.js.map