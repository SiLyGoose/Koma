import { MINUTE_MS } from './core.js';

/*
 * Random events (src/events): the event loop, crates and vaults.
 */

/**
 * How the bot decides when an event happens. Every `tickMs` it looks at each server that has an
 * events channel and starts an event in the ones that are due. An event that became due more than
 * `staleMs` ago (the bot was switched off at the time) is not started late: a new time is picked
 * instead, so a restart never causes a burst of events.
 */
export const EVENTS = { tickMs: 60_000, staleMs: 10 * MINUTE_MS } as const;

/** Longest the point crate can stay open, in seconds (the `events.crate.seconds` setting). */
export const MAX_CRATE_SECONDS = 600;

/**
 * The point crate's button and screen. `refreshMs` is the shortest time between edits of the
 * "grabbed so far" count, so a rush of presses is one edit (Discord limits message edits).
 * `listMax` is how many members the result names before saying "...and N more".
 */
export const CRATE = { grabId: 'crate_grab', refreshMs: 3_000, listMax: 15, imageName: 'crate.png' } as const;

/** Longest a vault breaker can stay open for joining, in seconds (the `events.vault.joinSeconds` setting). */
export const MAX_VAULT_SECONDS = 1_800;

/** Biggest `events.vault.multiplier` can be set to. */
export const MAX_VAULT_MULTIPLIER = 50;

/**
 * The vault breaker's button and screen, like CRATE's. `refreshMs` is the shortest time between
 * edits of the "who's joined" count. `listMax` is how many members the result names before saying
 * "...and N more".
 */
export const VAULT = { joinId: 'vault_join', refreshMs: 3_000, listMax: 15 } as const;
