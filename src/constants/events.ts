import { MINUTE_MS } from './core.js';

/*
 * Random events (src/events): the event loop, the point crate and the vault games.
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

/** Longest a vault game's join window (or Split or Steal's choosing time) can be, in seconds. */
export const MAX_EVENT_SECONDS = 1_800;

/** Biggest `events.vault.multiplier` can be set to. */
export const MAX_VAULT_MULTIPLIER = 50;

/** Most rounds a Greedy Heist can have (the `events.heist.rounds` setting). */
export const MAX_HEIST_ROUNDS = 20;

/**
 * Greedy Heist's buttons and screen. `refreshMs` is the shortest time between edits of the live
 * message (Discord limits message edits). `listMax` is how many members a list names before
 * saying "...and N more".
 */
export const HEIST = { joinId: 'heist_join', escapeId: 'heist_escape', refreshMs: 1_500, listMax: 15 } as const;

/** How many digits Codedle's code has. */
export const CODE_LENGTH = 5;

/**
 * Codedle's button, pop-up and screen. `inputId` is the pop-up's text box. `modalMs` is how
 * long a player has to type their guess after pressing Guess. `boardMax` is how many recent
 * guesses the screen shows. `refreshMs` as HEIST's.
 */
export const CODE = { guessId: 'code_guess', inputId: 'code', modalMs: 120_000, boardMax: 10, refreshMs: 1_500 } as const;

/** Split or Steal's buttons and screen, like HEIST's. */
export const SPLIT_STEAL = { joinId: 'ss_join', splitId: 'ss_split', stealId: 'ss_steal', refreshMs: 3_000, listMax: 15 } as const;
