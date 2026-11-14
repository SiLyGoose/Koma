import type { SkipUse } from '../../types.js';

/*
 * Paying to skip a cooldown (commands/skip.ts), with no database and no Discord: what a skip costs.
 * The first skip of a thing each day costs its base price, and each one after that the same day
 * costs double the one before, so skipping now and then is cheap but farming it never pays.
 */

/** How many times the member has skipped this thing on `day` (a stored use from an earlier day counts as none). */
export const skipsUsedOn = (use: SkipUse | null | undefined, day: string): number => (use && use.day === day ? use.count : 0);

/** What the next skip costs after `used` skips today: the base price, doubled once per skip already made. */
export function skipPrice(baseCost: number, used: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, baseCost * 2 ** Math.max(0, used));
}
