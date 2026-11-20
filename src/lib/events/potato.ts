import { randomInt } from 'node:crypto';

/*
 * The rules of the Hot Potato event, with no database and no Discord. Players join, then a potato
 * with a hidden fuse goes to one of them. Whoever holds it presses Pass to toss it to another
 * player at random. Pressing Pass when it isn't yours means you grab it (so mashing the button
 * only ever hands you the potato). When the fuse burns out, whoever holds it is out, and pays a
 * fine (the event charges it). Then the next potato comes out, until `blasts` have gone off; the
 * players left split the prize.
 */

export interface PotatoPlayer {
  userId: string;
  /** Out: holding a potato when it went off. */
  out: boolean;
  /** Which potato (1 is the first) blew up in their hands; 0 while they're still in. */
  blastedBy: number;
  /** Times they passed a potato on. */
  passes: number;
}

export interface PotatoState {
  players: PotatoPlayer[];
  /** Who has the potato, or null between potatoes. */
  holder: string | null;
}

/** What a press of Pass did. */
export type PassResult =
  | { kind: 'passed'; to: string }
  | { kind: 'grabbed'; from: string }
  | { kind: 'out' }
  | { kind: 'notPlaying' }
  | { kind: 'noPotato' };

/** How many potatoes go off: `wanted` (the setting), but never so many that nobody is left (one fewer than the players). */
export function potatoBlasts(wanted: number, players: number): number {
  return Math.max(0, Math.min(Math.floor(wanted), players - 1));
}

/** A fuse from `minSeconds` to `maxSeconds` long, in whole milliseconds. `rand` (min and max inclusive) is injectable for tests. */
export function rollFuseMs(minSeconds: number, maxSeconds: number, rand: (min: number, max: number) => number = (min, max) => randomInt(min, max + 1)): number {
  const min = Math.round(Math.min(minSeconds, maxSeconds) * 1000);
  const max = Math.round(Math.max(minSeconds, maxSeconds) * 1000);
  return rand(min, max);
}

export const playersIn = (state: PotatoState): PotatoPlayer[] => state.players.filter((player) => !player.out);

/** Hands a new potato to someone still in, at random (`pick` gives a number below what it's given; injectable for tests). Returns who. */
export function servePotato(state: PotatoState, pick: (below: number) => number = (n) => randomInt(n)): string | null {
  const left = playersIn(state);
  state.holder = left.length > 0 ? (left[pick(left.length)] as PotatoPlayer).userId : null;
  return state.holder;
}

/**
 * `userId` pressed Pass. The holder tosses it to another player still in: `to`, when they picked one who is (the site
 * lets them), otherwise one at random. Anyone else still in grabs it, whoever they picked. Decided at once, so two
 * presses can never both move the same potato.
 */
export function pressPass(state: PotatoState, userId: string, pick: (below: number) => number = (n) => randomInt(n), to?: string): PassResult {
  const player = state.players.find((p) => p.userId === userId);
  if (!player) return { kind: 'notPlaying' };
  if (player.out) return { kind: 'out' };
  if (state.holder === null) return { kind: 'noPotato' };
  if (state.holder !== userId) {
    const from = state.holder;
    state.holder = userId;
    return { kind: 'grabbed', from };
  }
  const others = playersIn(state).filter((p) => p.userId !== userId);
  // Only the holder is left (can't happen while potatoes still go off, but never toss it to nobody).
  if (others.length === 0) return { kind: 'passed', to: userId };
  const picked = others.find((p) => p.userId === to) ?? (others[pick(others.length)] as PotatoPlayer);
  player.passes++;
  state.holder = picked.userId;
  return { kind: 'passed', to: picked.userId };
}

/** Adds `move` to the end of `trail`, keeping only its last `keep`. */
export function addMove<T>(trail: T[], move: T, keep: number): void {
  trail.push(move);
  if (trail.length > keep) trail.splice(0, trail.length - keep);
}

/** The fuse of potato `blast` burned out: whoever holds it is out. Returns them (null if nobody held it). */
export function blowUp(state: PotatoState, blast: number): string | null {
  const holder = state.holder;
  state.holder = null;
  const player = state.players.find((p) => p.userId === holder);
  if (!player) return null;
  player.out = true;
  player.blastedBy = blast;
  return player.userId;
}
