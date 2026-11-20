/*
 * What Hot Potato's web page (the Koma-UI repo) and the bot say to each other over the WebSocket. Every message is one
 * JSON object with a `t` saying what it is. The site keeps a copy (its `yarn sync`).
 *
 * Hot Potato is a random event (the bot's events/games/hot-potato.ts): players join, then potatoes with a hidden fuse
 * go round. The holder presses Pass to toss it to another player at random; anyone else pressing Pass grabs it, and a
 * player's presses count at most once every `gapMs`. Whoever holds a potato when it goes off is out and pays a fine;
 * those left when the last one has gone off split the prize. It is played in Discord (its buttons) and on this page
 * alike, the one game. Everything about it is public, so every page in the server is told the same game; one that
 * didn't join in time watches it. With no Hot Potato going, the page shows how the last
 * one ended, and waits for the next.
 *
 *   page -> bot   hello    first message: the token from the link (or `watch`, with a watch link's: see connection.ts)
 *                 join     joins the game while it's open for joining
 *                 pass     presses Pass
 *   bot -> page   state    the game as it is now: whenever anything about it changes
 *                 answer   what came of the page's join or pass
 *                 error    and the bot closes the connection
 */

/** One player: their id and name, whether a potato has gone off in their hands (and which: 1 is the first), and how many times they've passed. */
export interface PotatoPlayer {
  id: string;
  name: string;
  out: boolean;
  blastedBy: number;
  passes: number;
}

/** A Hot Potato going on. */
export interface PotatoLive {
  /** Joining (until `joinEndsAt`), a potato going round, or one that just went off (the next comes in a moment). */
  phase: 'joining' | 'potato' | 'blast';
  /** What those left split, what being blown up costs, and when joining closes (ms since 1970). */
  prize: number;
  fine: number;
  joinEndsAt: number;
  /** How many potatoes go off (known once joining closes; the most there can be while joining), and which is out now (1 is the first). */
  blasts: number;
  blast: number;
  players: PotatoPlayer[];
  /** Who has the potato (null between potatoes). */
  holder: string | null;
  /** Who the last potato went off on (phase `blast`). */
  blown: string | null;
}

/** How the last Hot Potato in the server ended. */
export interface PotatoEnded {
  /** `done`: it was played; `notEnough`: fewer than 2 joined; `failed`: paying out went wrong (nobody was paid or fined). */
  kind: 'done' | 'notEnough' | 'failed';
  prize: number;
  /** Those left, and what each won; those blown up, and what each paid. */
  winners: { id: string; name: string; won: number }[];
  out: { id: string; name: string; fine: number; blast: number }[];
  endedAt: number;
}

export interface PotatoState {
  /** Who this page plays as, and whether they're in the game going on (false: they watch it). */
  you: string;
  playing: boolean;
  /** The fewest players a game needs, and the shortest gap between a player's presses that count (ms). */
  minPlayers: number;
  gapMs: number;
  /** The game going on (null: none right now), and how the last one ended (null: none has, since the bot last started). */
  live: PotatoLive | null;
  last: PotatoEnded | null;
}

/**
 * What came of a press. `join`: joined, or why not (`closed`: joining is over, `already`). `pass`: tossed it on (`to`
 * is the name), grabbed it from someone (`from`), or nothing (`tooFast`: too soon after the last press that counted,
 * `out`, `notPlaying`, `noPotato`: between potatoes).
 */
export type PotatoAnswer =
  | { t: 'answer'; to: 'join'; ok: true }
  | { t: 'answer'; to: 'join'; ok: false; reason: 'closed' | 'already' | 'over' }
  | { t: 'answer'; to: 'pass'; result: 'passed'; name: string }
  | { t: 'answer'; to: 'pass'; result: 'grabbed'; name: string }
  | { t: 'answer'; to: 'pass'; result: 'tooFast' | 'out' | 'notPlaying' | 'noPotato' };

export type ClientMessage = { t: 'hello'; token: string } | { t: 'watch'; token: string } | { t: 'join' } | { t: 'pass' };

export type ServerMessage = { t: 'state'; state: PotatoState } | PotatoAnswer | { t: 'error'; code: string };
