import { definePerk } from '../define.js';

/**
 * Raid, a warrior's: added to the share of an attack they strike back with when the boss hits them
 * (50% turns a warrior's half an attack into a whole one). It does nothing for any other class. Its
 * own mechanic, in lib/events/raid.ts.
 */
export const warriorCounter = definePerk({
  description: "Raid, warriors only: added to the share of an attack a warrior strikes back with when the boss hits them (50% turns their half an attack into a whole one).",
  defaults: { 1: 0.15, 2: 0.25, 3: 0.35, 4: 0.5 },
  min: 0,
  max: 2,
  text: (value) => `Raid (Warrior): you strike back for ${value} more of an attack when the boss hits you`,
});
