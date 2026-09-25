/*
 * Access, timing, the currency emoji and general limits used across the bot.
 */

/**
 * The only user who can change settings. This lives in code on purpose, not in the database,
 * so it can't be changed through the settings themselves.
 */
export const ADMIN_USER_ID = '257214680823627777';

export const MINUTE_MS = 60_000;

export const HOUR_MS = 60 * MINUTE_MS;

/** How often the bot re-reads the settings from MongoDB, so edits made there apply without a restart. */
export const SETTINGS_REFRESH_MS = MINUTE_MS;

/** Gear can never cut a rob or a pull by this much or more (0.9 = 90%), so nothing goes to zero. */
export const MAX_REDUCTION = 0.9;

/**
 * The emoji shown wherever points (the game's currency) are mentioned or an amount of them is shown. Change it here and it
 * changes everywhere. It has to be the full code, like `<:name:id>` (type `\:name:` in Discord to get it). Discord shows it in
 * message text, embed descriptions and field values, but not in slash command menus, button labels or embed footers, which
 * use CURRENCY_NAME instead.
 */
export const CURRENCY_EMOJI = '<:zeiucoin:1551675032424546320>';

/** The currency's name, lowercase and plural, for where the emoji can't show: slash command menus, help and embed footers. */
export const CURRENCY_NAME = 'points';

/**
 * komaTokens: a second currency that only buys gacha pulls, one token for one pull (won by beating
 * the weekly raid). A pull spends the member's tokens before their points. The emoji and name work
 * like CURRENCY_EMOJI and CURRENCY_NAME: the emoji is the full custom emoji code, and only shows in
 * message text, embed descriptions and field values.
 */
export const TOKEN_EMOJI = '<:zeiutoken:1552921364489572362>';
export const TOKEN_NAME = 'komaTokens';

/** Highest value a points setting accepts (claim range, pull cost, stolen amount, fine...). */
export const MAX_SETTING_POINTS = 1_000_000;

/** Longest a cooldown or protection timer setting can be, in minutes (10,080 is one week). */
export const MAX_TIMER_MINUTES = 10_080;

/** Most rows the leaderboard setting can ask for. */
export const MAX_LEADERBOARD_SIZE = 25;

/** Longest command prefix the settings accept. */
export const MAX_PREFIX_LENGTH = 10;

/** Most copies of an item the admin's give command hands out in one go. */
export const MAX_GIVE_AMOUNT = 100;

/** Rob and effect chances are rolled in this many steps. Only worth changing for very precise chances. */
export const CHANCE_STEPS = 1_000_000;
