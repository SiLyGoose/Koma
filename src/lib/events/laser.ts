import { randomInt } from 'node:crypto';
import { LASER } from '../../constants/index.js';

/*
 * The rules of the Laser Grid event, with no database and no Discord. Every round shows a row of
 * LASER.slots buttons; after a random wait, the laser fires and one of them turns into Duck!.
 * Everyone still in has to press that one before the round's time runs out, and the time gets
 * shorter every round. From the second round, some of the others can be fake ducks: just as green,
 * but saying something else (rollDecoys); pressing one is pressing a wrong button. Pressing before the laser fires, pressing a wrong button or not pressing in
 * time gets you caught (out, and fined: the event charges it). Only a player's first press in a
 * round counts, so mashing buttons only gets you caught. The players never caught split the prize by place, the fastest
 * in all getting the most (rankWinners, rankedSplit);
 * if every one of them is caught, it stays in the vault.
 */

/** How a player's round went. */
export type DuckResult = 'ducked' | 'early' | 'wrong' | 'late';

/** `wait` buttons are shown before the laser fires, `go` ones after. */
export type LaserPhase = 'wait' | 'go';

export interface LaserPlayer {
  userId: string;
  /** The round they were caught in, and how; 0 and null while they're still in. */
  caughtRound: number;
  caughtFor: Exclude<DuckResult, 'ducked'> | null;
  /** Their fastest duck, in milliseconds after the laser fired; null before their first. */
  bestMs: number | null;
  /** All their ducks' times added up (ms): what ranks those who make it through, who have all ducked the same rounds. */
  totalMs: number;
}

/** A duck in `ms`: kept as the player's best if it is, and added to their total. */
export function recordDuck(player: LaserPlayer, ms: number): void {
  player.bestMs = player.bestMs === null ? ms : Math.min(player.bestMs, ms);
  player.totalMs += ms;
}

/** Those never caught, fastest first: the least time ducking in all, then the fastest single duck, then (a tie) by id, so the order is always the same. */
export function rankWinners(players: readonly LaserPlayer[]): LaserPlayer[] {
  return players.filter(isIn).sort((a, b) => a.totalMs - b.totalMs || (a.bestMs ?? Infinity) - (b.bestMs ?? Infinity) || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
}

/**
 * Splits `prize` between `ranked` (first place first) by place: with n winners, first gets n parts, second n - 1, and so
 * on to 1 for the last (3 winners: half, a third and a sixth). Rounded down, the few points that leaves going one each
 * from first place on, so the shares add up to exactly the prize and never go out of order.
 */
export function rankedSplit(prize: number, ranked: readonly string[]): { userId: string; amount: number }[] {
  const n = ranked.length;
  if (n === 0 || !(prize > 0)) return ranked.map((userId) => ({ userId, amount: 0 }));
  const parts = (n * (n + 1)) / 2;
  const shares = ranked.map((userId, i) => ({ userId, amount: Math.floor((prize * (n - i)) / parts) }));
  let left = prize - shares.reduce((sum, share) => sum + share.amount, 0);
  for (let i = 0; left > 0; i = (i + 1) % n, left--) (shares[i] as { amount: number }).amount++;
  return shares;
}

export const isIn = (player: LaserPlayer): boolean => player.caughtFor === null;

/** A slot button's id: which round and phase it was shown in, and which slot it is. */
export const slotId = (round: number, phase: LaserPhase, slot: number): string => `${LASER.slotPrefix}:${round}:${phase}:${slot}`;

/** The round, phase and slot of a slot button's id, or null if it isn't one. */
export function parseSlotId(id: string): { round: number; phase: LaserPhase; slot: number } | null {
  const match = new RegExp(`^${LASER.slotPrefix}:(\\d+):(wait|go):(\\d+)$`).exec(id);
  if (!match) return null;
  return { round: Number(match[1]), phase: match[2] as LaserPhase, slot: Number(match[3]) };
}

/**
 * How long round `round` (1 to `rounds`) gives to duck, in milliseconds: `startSeconds` in the
 * first round, shrinking evenly to `endSeconds` in the last.
 */
export function laserWindowMs(round: number, rounds: number, startSeconds: number, endSeconds: number): number {
  const progress = rounds > 1 ? Math.min(1, Math.max(0, (round - 1) / (rounds - 1))) : 0;
  return Math.round((startSeconds + (endSeconds - startSeconds) * progress) * 1000);
}

/**
 * The fake ducks of a round: green like Duck! but saying something else (a word from `labels`), on `count` of the slots
 * that aren't `duckSlot` (fewer if there aren't that many, always leaving one laser). Pressing one is a wrong button.
 * `pick` gives a number below what it's given (injectable for tests). Returns each one's slot and word.
 */
export function rollDecoys(slots: number, duckSlot: number, count: number, labels: readonly string[], pick: (below: number) => number = (n) => randomInt(n)): Map<number, string> {
  const free = Array.from({ length: slots }, (_, slot) => slot).filter((slot) => slot !== duckSlot);
  const decoys = new Map<number, string>();
  const wanted = Math.max(0, Math.min(Math.floor(count), free.length - 1));
  if (labels.length === 0) return decoys;
  while (decoys.size < wanted) {
    const slot = free.splice(pick(free.length), 1)[0] as number;
    decoys.set(slot, labels[pick(labels.length)] as string);
  }
  return decoys;
}

/** How many fake ducks round `round` has: none in the first (to learn the game on), then from 0 to `most`. `rand` (both ends inclusive) is injectable for tests. */
export function decoyCount(round: number, most: number, rand: (min: number, max: number) => number = (min, max) => randomInt(min, max + 1)): number {
  return round <= 1 || most <= 0 ? 0 : rand(0, most);
}

/**
 * What one press does: a `wait` button is pressed too early, a `go` button that isn't `duckSlot`
 * is the wrong one, and the right one pressed after `deadlineMs` is too late.
 */
export function judgePress(phase: LaserPhase, slot: number, duckSlot: number, nowMs: number, deadlineMs: number): DuckResult {
  if (phase === 'wait') return 'early';
  if (slot !== duckSlot) return 'wrong';
  return nowMs > deadlineMs ? 'late' : 'ducked';
}

/**
 * Ends round `round`: everyone still in who didn't duck (in `results`, a player's first press of the
 * round) is caught, those who never pressed for being too late. Returns who was caught.
 */
export function settleRound(players: readonly LaserPlayer[], results: ReadonlyMap<string, DuckResult>, round: number): LaserPlayer[] {
  const caught: LaserPlayer[] = [];
  for (const player of players) {
    if (!isIn(player)) continue;
    const result = results.get(player.userId) ?? 'late';
    if (result === 'ducked') continue;
    player.caughtFor = result;
    player.caughtRound = round;
    caught.push(player);
  }
  return caught;
}
