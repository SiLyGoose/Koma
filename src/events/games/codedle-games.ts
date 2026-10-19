import type { Mark } from '../../lib/events/code.js';

/*
 * The Codedle going on in each server, and how the last one ended, for everything that plays it: its Discord message
 * (./codedle.ts, which runs it) and the site's page (web/games/codedle/). Both guess through the one game, so a code
 * cracked on the site closes the vault in Discord, and the other way round. Like the game itself it is only in memory:
 * a restart forgets it.
 */

/** One guess: who made it (their id, and their name as the server has it), the digits, and their hint. */
export interface CodeGuess {
  userId: string;
  name?: string;
  guess: string;
  marks: Mark[];
}

/** What came of a guess: its hint (and whether it cracked the code), or why it wasn't taken (nothing was charged). */
export type GuessOutcome = { ok: true; guess: string; marks: Mark[]; won: boolean } | { ok: false; reason: 'bad_guess' | 'over' | 'cant_afford' | 'failed' };

/** A Codedle going on. */
export interface CodedleGame {
  readonly prize: number;
  readonly guessCost: number;
  /** When it closes (ms since 1970). */
  readonly endsAt: number;
  readonly guesses: readonly CodeGuess[];
  /** `name` guesses `text` (as typed): charged for it, and scored. */
  guess(userId: string, name: string, text: string): Promise<GuessOutcome>;
}

/** How a Codedle ended: the code, the prize, who cracked it (null: nobody), everyone's guesses, and when. */
export interface CodedleEnd {
  code: string;
  prize: number;
  winner: { userId: string; name: string } | null;
  guesses: readonly CodeGuess[];
  endedAt: number;
}

const going = new Map<string, CodedleGame>();
const ended = new Map<string, CodedleEnd>();
const listeners = new Set<(guildId: string) => void>();

/** The Codedle going on in `guildId` (null: none). */
export const codedleIn = (guildId: string): CodedleGame | null => going.get(guildId) ?? null;

/** How the last Codedle in `guildId` ended (null: none has, since the bot started). */
export const lastCodedle = (guildId: string): CodedleEnd | null => ended.get(guildId) ?? null;

/** Calls `listener` with the server whenever its Codedle changes (it opens, takes a guess, or ends). Returns a function that stops it. */
export function onCodedleChange(listener: (guildId: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Tells everyone listening that `guildId`'s Codedle has changed. */
export function codedleChanged(guildId: string): void {
  for (const listener of listeners) {
    try {
      listener(guildId);
    } catch (err) {
      console.error('A Codedle listener failed:', err);
    }
  }
}

/** `game` opens in `guildId`. */
export function codedleOpened(guildId: string, game: CodedleGame): void {
  going.set(guildId, game);
  codedleChanged(guildId);
}

/** `guildId`'s Codedle is over: how it ended (null: it failed, and is just gone). */
export function codedleClosed(guildId: string, end: CodedleEnd | null): void {
  going.delete(guildId);
  if (end) ended.set(guildId, end);
  codedleChanged(guildId);
}
