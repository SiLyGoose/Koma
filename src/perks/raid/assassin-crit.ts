import { definePerk } from '../define.js';

/**
 * Raid, an assassin's: added to their crit chance (50% turns the usual 10% into 60%). It does nothing
 * for any other class. Its own mechanic, in lib/events/raid.ts.
 */
export const assassinCrit = definePerk({
  description: "Raid, assassins only: added to an assassin's crit chance (50% turns the usual 10% into 60%).",
  defaults: { 1: 0.1, 2: 0.2, 3: 0.3, 4: 0.5 },
  min: 0,
  max: 1,
  text: (value) => `Raid (Assassin): +${value} crit chance`,
});
