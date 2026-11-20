import { HOUR_MS, MINUTE_MS } from './core.js';

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

/** The `events` command's list: how many events a page shows, and how long its Previous/Next buttons stay after the last press. */
export const EVENTS_LIST = { pageSize: 3, idleMs: 120_000 } as const;

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

/**
 * Most time the vault's hourly growth makes up for at once, so a server that had events off for a
 * while (or a bot that was down a long time) doesn't get a huge lump when it comes back.
 */
export const MAX_VAULT_CATCH_UP_MS = 24 * HOUR_MS;

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
 * Codedle's buttons, pop-up and screen. `mineId` is the button that shows a player their own
 * guesses. `inputId` is the pop-up's text box. `modalMs` is how
 * long a player has to type their guess after pressing Guess. `boardMax` is how many recent
 * guesses a board shows. `refreshMs` as HEIST's.
 */
export const CODE = { guessId: 'code_guess', mineId: 'code_mine', inputId: 'code', modalMs: 120_000, boardMax: 10, refreshMs: 1_500 } as const;

/**
 * Codedle's web page (web/games/codedle/): its web socket's path, how long a page has to say hello, how many messages a
 * second it may send, and the most guesses a revealed board shows it.
 */
export const CODEDLE_WEB = { path: '/codedle', helloMs: 10_000, messagesPerSecond: 20, boardMax: 60 } as const;

/** Split or Steal's buttons and screen, like HEIST's. */
export const SPLIT_STEAL = { joinId: 'ss_join', splitId: 'ss_split', stealId: 'ss_steal', refreshMs: 3_000, listMax: 15 } as const;

/**
 * Presses by one player closer together than this count once (the first), so mashing a button
 * gets no more done than pressing it at this pace (a double click counts once). Used where pressing
 * fast would pay: Hot Potato's Pass.
 */
export const CLICK_GAP_MS = 500;

/** Most potatoes a Hot Potato can have (the `events.potato.blasts` setting). */
export const MAX_POTATO_BLASTS = 20;

/**
 * Hot Potato's buttons and screen. `refreshMs` as HEIST's (shorter, so the holder sees it's theirs
 * soon). `pauseMs` is how long a blast is shown before the next potato comes out.
 */
export const POTATO = { joinId: 'potato_join', passId: 'potato_pass', refreshMs: 1_000, pauseMs: 4_000, listMax: 15 } as const;

/**
 * Hot Potato's and Laser Grid's web pages (web/games/potato/, web/games/laser/): each web socket's path, how long a page
 * has to say hello, and how many messages a second it may send (Hot Potato's above what mashing Pass sends: too many
 * hangs up, and the click gate ignores them anyway).
 */
export const POTATO_WEB = { path: '/potato', helloMs: 10_000, messagesPerSecond: 40 } as const;
export const LASER_WEB = { path: '/laser', helloMs: 10_000, messagesPerSecond: 20 } as const;

/** Most rounds a Laser Grid can have (the `events.laser.rounds` setting). */
export const MAX_LASER_ROUNDS = 20;

/**
 * Laser Grid's buttons and screen. `slotPrefix` starts each slot button's id (lib/events/laser.ts's
 * slotId). `slots` is how many buttons a row has (Discord's most is 5). Each round the laser comes
 * a random `minDelayMs` to `maxDelayMs` after the round is shown, and the round's result is shown
 * for `pauseMs`. From the second round a round has up to `maxDecoys` fake ducks (green, but not
 * saying Duck!). `listMax` as HEIST's.
 */
export const LASER = { joinId: 'laser_join', slotPrefix: 'laser', slots: 5, maxDecoys: 2, minDelayMs: 2_000, maxDelayMs: 6_000, pauseMs: 3_500, listMax: 15 } as const;
