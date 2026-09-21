import { MINUTE_MS } from '../constants.js';
import { randInt } from '../lib/random.js';

/*
 * When events happen, as pure functions. Each server that has an events channel has a "next
 * event" time. Every tick the bot compares it with the clock and does one of these things.
 */

/**
 * What to do for one server at one tick:
 * - schedule: there is no next time yet, so pick one (nothing starts)
 * - wait: it is not due yet
 * - fire: it is due, so start an event and pick the next time
 * - skip: it was due more than `staleMs` ago (the bot was off), so pick a new time without starting anything
 */
export type TickDecision = 'schedule' | 'wait' | 'fire' | 'skip';

export function decideTick(now: number, nextAt: number | null, staleMs: number): TickDecision {
  if (nextAt === null) return 'schedule';
  if (now < nextAt) return 'wait';
  if (now - nextAt > staleMs) return 'skip';
  return 'fire';
}

/** How long to wait until the next event: a random whole number of minutes from `minMinutes` to `maxMinutes`, in milliseconds. */
export function randomGapMs(minMinutes: number, maxMinutes: number, rand: (min: number, max: number) => number = randInt): number {
  if (!Number.isInteger(minMinutes) || !Number.isInteger(maxMinutes) || minMinutes < 1 || maxMinutes < minMinutes) {
    throw new Error(`The time between events needs two whole numbers of minutes, 1 or more, in order (got ${minMinutes} and ${maxMinutes})`);
  }
  return rand(minMinutes, maxMinutes) * MINUTE_MS;
}
