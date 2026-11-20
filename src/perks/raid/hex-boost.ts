import { definePerk } from '../define.js';

/**
 * Raid, a wizard's: the wearer's hex weakens the boss's move by this much more (15% turns a wizard's
 * 20% into 35%). It does nothing for any other class. Its own mechanic, in lib/events/raid.ts.
 */
export const hexBoost = definePerk({
  description: "Raid, wizards only: how much more a wizard's hex weakens the boss's move (15% turns their 20% into 35%).",
  defaults: { 1: 0.05, 2: 0.08, 3: 0.11, 4: 0.15 },
  min: 0,
  max: 1,
  text: (value) => `Raid (Wizard): your hex weakens the boss's move by ${value} more`,
});
