/*
 * Discord limits and timings: slash commands, autocomplete, embeds, buttons and avatars.
 */

/**
 * How long a slash command may go without a reply before the bot tells Discord "one moment"
 * (shown as "Koma is thinking..."). Discord fails a slash command that isn't answered within 3
 * seconds, so keep this under 3000. A reply made after this is always public.
 */
export const SLASH_DEFER_AFTER_MS = 2500;

/**
 * Commands that can only be used with the prefix (`k!rob`), not as slash commands. They aren't
 * registered with Discord, a slash command with that name is answered as unknown, and `/help`
 * leaves them out. Their entries in `SLASH` (discord/slash.ts) can stay, so taking a name off
 * this list brings the slash command back at the next start. Names are command names, in lower case.
 */
export const SLASH_EXCLUDED: readonly string[] = ['rob'];

/** Most choices Discord shows in an autocomplete list. */
export const AUTOCOMPLETE_MAX_CHOICES = 25;

/** Longest text put in one embed field before it is cut off with "...and N more" (Discord's own limit is 1024). */
export const FIELD_MAX_LENGTH = 1_000;

/**
 * Most items shown on one page of the databank: it's a flip-through book, not one long list, so
 * a tier with more than this splits into pages you page through with buttons instead of everything
 * landing in one message.
 */
export const DATABANK_ITEMS_PER_PAGE = 5;

/** How long the databank's Previous/Next buttons keep working after the last time they were used. */
export const DATABANK_BUTTONS = { idleMs: 120_000 };

/** How long the settings list's Previous/Next buttons keep working after the last time they were used. */
export const CONFIG_BUTTONS = { idleMs: 120_000 };

/**
 * Fetching a member's profile picture for the blackjack table (src/discord/profile.ts): the size
 * asked from Discord (a power of two from 16 to 4096; the picture is drawn 34 pixels across), how
 * long to wait for it, the biggest file taken, and how many pictures are kept in memory. If the
 * picture doesn't arrive in time the table shows a coloured circle with the first letter instead.
 */
export const AVATAR = { size: 64, timeoutMs: 3000, maxBytes: 300_000, cacheMax: 200 } as const;
