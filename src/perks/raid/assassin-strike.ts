import { definePerk } from '../define.js';

/**
 * Raid, an assassin's: added to what their class multiplies their attacks by (50% turns an assassin's
 * 1.25x into 1.75x). It does nothing for any other class. Its own mechanic, in lib/events/raid.ts.
 */
export const assassinStrike = definePerk({
  description: "Raid, assassins only: added to what an assassin's attacks are multiplied by (50% turns their 1.25x into 1.75x).",
  defaults: { 1: 0.15, 2: 0.25, 3: 0.35, 4: 0.5 },
  min: 0,
  max: 1,
  text: (value) => `Raid (Assassin): your attacks do ${value} more of their plain damage`,
});
