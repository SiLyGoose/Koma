import { definePerk } from '../define.js';

/**
 * Raid: when the wearer heals, a second hurt ally (the most hurt one besides whoever the heal went
 * to) is also healed, by this share of the heal's value, and has the Plague Matriarch's Blight cleared
 * as a heal would. Its own mechanic, in lib/events/raid.ts.
 */
export const healSplash = definePerk({
  description: "Raid: when the wearer heals, the next most hurt ally is also healed by this share of the heal's value.",
  // The 4-star (the Plague Doctor's Coat, a raid drop) is a big step up: half the heal for a second ally.
  defaults: { 1: 0.1, 2: 0.15, 3: 0.2, 4: 0.5 },
  min: 0,
  max: 1,
  text: (value) => `Raid: heals also mend a second ally for ${value} of the heal`,
});
