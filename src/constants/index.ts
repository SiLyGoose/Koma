/*
 * Every fixed value and every piece of text the bot sends, in this folder, so you can change
 * them without hunting through the code. Import them from here (constants/index.js).
 *
 * Where things are:
 *   - core.ts        access, timing, the currency emoji, general limits
 *   - formatting.ts  stars, number locale, percent decimals, gear slot labels
 *   - loadouts.ts    how many gear loadouts a member has, and how long their names can be
 *   - discord.ts     slash commands, autocomplete, embed and button limits, avatars
 *   - gacha.ts, rob.ts, wheel.ts, d20.ts, stonks.ts, plinko.ts, blackjack.ts, events.ts, raid.ts
 *                    each feature's numbers
 *   - text/          every message the bot sends, one file per command or feature (TEXT)
 *   - validate.ts    the startup check (validateConstants); add a check there for a new value
 *
 * To add a value, put it in the file for its feature (or a new file, exported below).
 *
 * What is NOT here, on purpose:
 *   - The settings you change while the bot runs (prefix, embed color, claim range, pull cost,
 *     rob numbers, gear strength...). Those live in MongoDB; their starting values are DEFAULTS
 *     in config.ts, and `k!config` edits them.
 *   - The item catalog (data/items/catalog.ts) and the perk registry (perks/index.ts). Each perk's gear-card line lives in its own perk file.
 *   - Database names (collections, the settings document id, ledger reasons). They are stored
 *     data: renaming one makes the bot stop seeing what it saved under the old name.
 *   - Command names, aliases and help descriptions. They stay on each command.
 *
 * Files here import only types from the rest of the code, never runtime values, so anything can
 * import them without load-order problems.
 */

export * from './core.js';
export * from './formatting.js';
export * from './discord.js';
export * from './gacha.js';
export * from './rob.js';
export * from './wheel.js';
export * from './d20.js';
export * from './stonks.js';
export * from './plinko.js';
export * from './blackjack.js';
export * from './events.js';
export * from './raid.js';
export * from './refine.js';
export * from './loadouts.js';
export { TEXT } from './text/index.js';
export { validateConstants } from './validate.js';
