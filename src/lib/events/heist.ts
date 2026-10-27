import { splitPile } from './crate.js';

/*
 * The rules of the Greedy Heist event, with no database and no Discord. The prize is handed out
 * a slice per round to whoever is still inside. Before each round's slice, the alarm rolls, with a
 * chance that climbs every round. Escaping keeps what you have, times a multiplier that grows with
 * every round the alarm stayed quiet; getting caught loses it (and costs a fine, which the event
 * itself charges).
 */

/** The chance (0 to 1) the alarm goes off in `round` (1 is the first): `start`, plus `step` for every round after the first, never above 1. */
export function alarmChance(round: number, start: number, step: number): number {
  return Math.min(1, Math.max(0, start + step * (round - 1)));
}

/**
 * How much of `prize` is handed out in `round` (1 to `rounds`). Every round gets the prize divided
 * by the number of rounds, rounded down, and the last round also gets what that leaves over, so
 * the rounds add up to exactly the prize (and staying to the end is worth a little extra).
 */
export function roundPot(prize: number, rounds: number, round: number): number {
  if (!(rounds >= 1) || round < 1 || round > rounds) return 0;
  const each = Math.floor(prize / rounds);
  return round === rounds ? prize - each * (rounds - 1) : each;
}

/** What loot is multiplied by on the way out after `quiet` rounds without the alarm: 1, plus `bonus` for each. */
export function quietMultiplier(quiet: number, bonus: number): number {
  return 1 + Math.max(0, bonus) * Math.max(0, quiet);
}

/** `loot` times `multiplier`, rounded down (past float noise, so 1.1x of 100 is 110): what a player leaving with it is paid. */
export const multipliedLoot = (loot: number, multiplier: number): number => Math.floor(loot * multiplier + 1e-9);

/** Where a heist player ended up. */
export type HeistStatus = 'inside' | 'escaped' | 'caught';

export interface HeistPlayer {
  userId: string;
  /** Loot collected so far. Only paid if they escape (or survive to the end), and then already multiplied. */
  loot: number;
  status: HeistStatus;
}

/** Takes `player` out of the heist, their loot multiplied by `multiplier` (the quiet rounds so far). */
export function escapePlayer(player: HeistPlayer, multiplier: number): void {
  player.loot = multipliedLoot(player.loot, multiplier);
  player.status = 'escaped';
}

/**
 * Splits one round's `pot` between everyone still `inside` (like a crate's pile: evenly, the few
 * points left over going one each to random players) and adds it to their loot. Returns what was
 * handed out: the whole pot, or 0 when nobody is inside. `pick` is injectable for tests.
 */
export function addRoundLoot(players: readonly HeistPlayer[], pot: number, pick?: (below: number) => number): number {
  const inside = players.filter((player) => player.status === 'inside');
  if (inside.length === 0 || pot <= 0) return 0;
  const shares = splitPile(pot, inside.map((player) => player.userId), pick);
  for (const [index, share] of shares.entries()) (inside[index] as HeistPlayer).loot += share.amount;
  return pot;
}
