import { definePerk } from '../define.js';

/**
 * Raid, a priest's (Circle of Death): what the wearer's heal couldn't mend (its target was already
 * full, or nobody was hurt at all) hits the boss instead, for this share of the excess. It does nothing
 * for any other class. Its own mechanic, in lib/events/raid.ts.
 */
export const circleOfDeath = definePerk({
  description: "Raid, priests only (Circle of Death): the share of a priest's excess healing (what their heal couldn't mend) that hits the boss as damage.",
  defaults: { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1 },
  min: 0,
  max: 5,
  text: (value) => `Raid (Priest), Circle of Death: healing past full HP hits the boss for ${value} of the excess`,
});
