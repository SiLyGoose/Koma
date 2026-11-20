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
 *   page -> bot   hello    first message: the token from the link (or `watch`, with a watch link's: see connection.ts)
 *                 join     joins the game while it's open for joining
 *                 press    presses slot `slot` of round `round`, as shown in `phase`
 *   bot -> page   state    the game as it is now: whenever anything about it changes
 *                 answer   what came of the page's join or press
 *                 error    and the bot closes the connection
 */

/** How a player was caught: pressed before the laser fired, pressed a laser, or didn't press Duck! in time. */
export type LaserCaught = 'early' | 'wrong' | 'late';

/** One player: id and name, when and how they were caught (0 and null while still in), and their fastest duck (ms, null before their first). */
export interface LaserPlayer {
  id: string;
  name: string;
  caughtRound: number;
  caughtFor: LaserCaught | null;
  bestMs: number | null;
}

/** A Laser Grid going on. */
export interface LaserLive {
  /** Joining (until `joinEndsAt`); a round waiting for the laser; the laser out; or the round's result, before the next. */
  phase: 'joining' | 'ready' | 'fire' | 'roundOver';
  /** What the players never caught split (it grows by `bonusPerPlayer` with every player who joins), what being caught costs, when joining closes. */
  prize: number;
  bonusPerPlayer: number;
  fine: number;
  joinEndsAt: number;
  rounds: number;
  /** The round being played (0 while joining), and the time it gives to duck (ms). */
  round: number;
  windowMs: number;
  /** How many buttons a row has, and which is Duck! (null until the laser fires). */
  slots: number;
  duckSlot: number | null;
  /** The fake ducks: green like Duck!, but saying label instead (pressing one is pressing a wrong button). Empty until the laser fires. */
  decoys: { slot: number; label: string }[];
  /** When the round's time runs out (ms since 1970, by the bot's clock; null until the laser fires). */
  deadline: number | null;
  players: LaserPlayer[];
  /** The round's fastest duck (phase `roundOver`): who, and how fast (ms). */
  fastest: { id: string; ms: number } | null;
}

/** How the last Laser Grid in the server ended. */
export interface LaserEnded {
  /** `done`: it was played (`winners` empty: everyone was caught, and the money stayed in the vault); `nobody`: nobody joined; `failed`: paying out went wrong. */
  kind: 'done' | 'nobody' | 'failed';
  prize: number;
  /** The round the last were caught in, or the last round played. */
  lastRound: number;
  winners: { id: string; name: string; won: number; bestMs: number | null }[];
  caught: { id: string; name: string; fine: number; round: number; caughtFor: LaserCaught }[];
  endedAt: number;
}

export interface LaserState {
  /** Who this page plays as, and whether they're in the game going on (false: they watch it). */
  you: string;
  playing: boolean;
  live: LaserLive | null;
  last: LaserEnded | null;
}

/**
 * What came of a press. `join`: joined, or why not. `press`: ducked (in `ms`), or caught (`early`, `wrong`, `late`),
 * or nothing (`stale`: a button from another round, `closed`: between rounds, `already`: a press this round already
 * counted, `out`: caught before, `notPlaying`).
 */
export type LaserAnswer =
  | { t: 'answer'; to: 'join'; ok: true }
  | { t: 'answer'; to: 'join'; ok: false; reason: 'closed' | 'already' | 'over' }
  | { t: 'answer'; to: 'press'; result: 'ducked'; ms: number }
  | { t: 'answer'; to: 'press'; result: LaserCaught | 'stale' | 'closed' | 'already' | 'out' | 'notPlaying' };

export type ClientMessage =
  | { t: 'hello'; token: string }
  | { t: 'watch'; token: string }
  | { t: 'join' }
  | { t: 'press'; round: number; phase: 'wait' | 'go'; slot: number };

export type ServerMessage = { t: 'state'; state: LaserState } | LaserAnswer | { t: 'error'; code: string };
