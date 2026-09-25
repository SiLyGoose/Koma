import { definePerk } from './define.js';

/**
 * Raid: when the wearer heals, a second hurt ally (the most hurt one besides whoever the heal went
 * to) is also healed, by this share of the heal's value. Its own mechanic, in lib/events/raid.ts.
 */
export const healSplash = definePerk({
  description: "Raid: when the wearer heals, the next most hurt ally is also healed by this share of the heal's value.",
  defaults: { 1: 0.1, 2: 0.15, 3: 0.2, 4: 0.3 },
  min: 0,
  max: 1,
  text: (value) => `Raid: heals also mend a second ally for ${value} of the heal`,
});
