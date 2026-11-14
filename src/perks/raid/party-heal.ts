import { definePerk } from '../define.js';

/**
 * Raid, a priest's: when the wearer heals, every other hurt ally is healed too, by this share of the
 * heal's value. It does nothing for any other class. Its own mechanic, in lib/events/raid.ts.
 */
export const partyHeal = definePerk({
  description: "Raid, priests only: when a priest heals, every other hurt ally is also healed by this share of the heal's value.",
  defaults: { 1: 0.1, 2: 0.15, 3: 0.2, 4: 0.3 },
  min: 0,
  max: 1,
  text: (value) => `Raid (Priest): your heals also mend every other ally for ${value} of the heal`,
});
