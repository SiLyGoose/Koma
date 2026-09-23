/*
 * The rules of the vault breaker event, with no database and no Discord. A vault breaker succeeds
 * or fails on a single roll of a chance that climbs with how many people joined; when it succeeds
 * the prize is split the same way a point crate's pile is (see crate.ts's splitPile, reused as-is).
 */

/**
 * The chance a vault breaker succeeds with `joiners` people in it: 0 below `minPlayers`, `baseChance`
 * at exactly `minPlayers`, rising by `chancePerPlayer` for each joiner past that, capped at `maxChance`.
 */
export function vaultChance(joiners: number, minPlayers: number, baseChance: number, chancePerPlayer: number, maxChance: number): number {
  if (joiners < minPlayers) return 0;
  return Math.min(maxChance, baseChance + chancePerPlayer * (joiners - minPlayers));
}
