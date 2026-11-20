import { definePerk } from '../define.js';

/**
 * Raid, an archer's: how much more their attacks gain for every turn in a row they attack (5% turns
 * an archer's 10% a turn into 15%), and five turns' worth more that it can reach in all. It does
 * nothing for any other class. Its own mechanic, in lib/events/raid.ts.
 */
export const archerRamp = definePerk({
  description: "Raid, archers only: how much more an archer's attacks gain for every turn in a row they attack (5% turns their 10% a turn into 15%, and their 50% at most into 75%).",
  defaults: { 1: 0.02, 2: 0.03, 3: 0.04, 4: 0.05 },
  min: 0,
  max: 1,
  text: (value) => `Raid (Archer): your attacks gain ${value} more for every turn in a row you attack`,
});
