/*
 * What Codedle's web page (the Koma-UI repo) and the bot say to each other over the WebSocket. Every message is one
 * JSON object with a `t` saying what it is. The site keeps a copy (its `yarn sync`).
 *
 * Codedle is a random event (the bot's events/games/codedle.ts): the vault is locked with a code of `length` digits, and
 * the first to guess it takes the prize. It is played in Discord (its Guess pop-up) and on this page alike, the one game:
 * each guess costs its fee, and is scored Wordle-style. A page is told only its own player's guesses and hints while the
 * vault is locked (and how many guesses everyone has made); once it opens, or time runs out, the code and everyone's
 * guesses. With no Codedle going, the page shows how the last one in the server ended, and waits for the next.
 *
 *   page -> bot   hello    first message: the token from the link
 *                 guess    a guess of `length` digits; `seq` counts up from 1 with every guess
 *   bot -> page   state    the game as it is now, for this player: whenever anything about it changes
 *                 answer   what came of the page's guess `seq`: its hint, or why it wasn't taken (nothing was charged)
 *                 error    and the bot closes the connection
 */

export type CodedleMark = 'hit' | 'near' | 'miss';

/** One guess and its hint, a digit each; with who guessed it once the board is revealed (`name`), and whether it was this player's. */
export interface CodedleRow {
  guess: string;
  marks: CodedleMark[];
  name?: string;
  mine?: boolean;
}

/** A Codedle going on, as one player sees it. */
export interface CodedleLive {
  /** What is in the vault, what a guess costs (0: free), and when it closes (ms since 1970). */
  prize: number;
  guessCost: number;
  endsAt: number;
  /** How many guesses everyone has made, and how many players made them. */
  guesses: number;
  guessers: number;
  /** This player's own guesses, oldest first. */
  mine: CodedleRow[];
}

/** How the last Codedle in the server ended. */
export interface CodedleEnded {
  code: string;
  prize: number;
  /** Who cracked it (null: nobody did, and the money stayed in the vault), and whether it was this player. */
  winner: string | null;
  won: boolean;
  /** Everyone's guesses, the latest `CodedleState.boardMax` of them; and how many there were in all. */
  board: CodedleRow[];
  guesses: number;
  endedAt: number;
}

export interface CodedleState {
  /** How many digits a code has. */
  length: number;
  /** The Codedle going on (null: none right now). */
  live: CodedleLive | null;
  /** How the last one ended (null: none has, since the bot last started). */
  last: CodedleEnded | null;
  /** The most guesses a revealed board shows. */
  boardMax: number;
}

/** Why a guess wasn't taken: not `length` digits, no Codedle going (or it just closed), not enough points, or something went wrong. */
export type CodedleRefusal = 'bad_guess' | 'over' | 'cant_afford' | 'failed';

export type ClientMessage = { t: 'hello'; token: string } | { t: 'guess'; guess: string; seq: number };

export type ServerMessage =
  | { t: 'state'; state: CodedleState }
  | { t: 'answer'; seq: number; ok: true; guess: string; marks: CodedleMark[]; won: boolean }
  | { t: 'answer'; seq: number; ok: false; reason: CodedleRefusal }
  | { t: 'error'; code: string };
