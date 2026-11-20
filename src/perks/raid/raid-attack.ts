import { definePerk } from '../define.js';

/**
 * Raid: the wearer's attacks hit this much harder (25% turns 60 damage into 75), before rallies and
 * crits multiply them. Its own mechanic, in lib/events/raid.ts.
 */
export const raidAttack = definePerk({
  description: "Raid: how much harder the wearer's attacks hit, before rallies and crits (25% turns 60 damage into 75).",
  defaults: { 1: 0.1, 2: 0.15, 3: 0.25, 4: 0.35 },
  min: 0,
  max: 10,
  text: (value) => `Raid: attacks deal ${value} more damage`,
});
