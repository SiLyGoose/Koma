import { splitPile, type CrateShare } from './crate.js';

/*
 * The rules of the Split or Steal event, with no database and no Discord. Everyone who joined
 * picks Split or Steal in secret (no pick counts as Split):
 *   - everyone split: the prize is shared evenly (like a crate's pile);
 *   - exactly one steal: the stealer takes it all;
 *   - two or more steal: nobody gets anything.
 */

export type SplitStealChoice = 'split' | 'steal';

export type SplitStealOutcome =
  | { kind: 'shared'; shares: CrateShare[] }
  | { kind: 'stolen'; thief: string; shares: CrateShare[] }
  | { kind: 'greed'; stealers: string[]; shares: CrateShare[] };

/** The choice that counts for `userId`: what they picked, or Split if they picked nothing. */
export function choiceOf(choices: ReadonlyMap<string, SplitStealChoice>, userId: string): SplitStealChoice {
  return choices.get(userId) ?? 'split';
}

/** Who gets what, from everyone's choices. `players` is everyone who joined, each once. `pick` is injectable for tests. */
export function resolveSplitSteal(
  prize: number,
  players: readonly string[],
  choices: ReadonlyMap<string, SplitStealChoice>,
  pick?: (below: number) => number,
): SplitStealOutcome {
  const stealers = players.filter((userId) => choiceOf(choices, userId) === 'steal');
  if (stealers.length === 0) return { kind: 'shared', shares: splitPile(prize, players, pick) };
  if (stealers.length === 1) {
    const thief = stealers[0] as string;
    return { kind: 'stolen', thief, shares: [{ userId: thief, amount: prize }] };
  }
  return { kind: 'greed', stealers, shares: [] };
}
