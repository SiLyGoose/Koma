import { definePerk } from '../define.js';

/**
 * Raid: added to the wearer's chance to land a critical hit (RAID_COMBAT.attack.critChance, 10%):
 * 12% makes it 22%. Its own mechanic, in lib/events/raid.ts.
 */
export const raidCritChance = definePerk({
  description: "Raid: added to the wearer's chance of a critical hit (12% turns the base 10% into 22%).",
  defaults: { 1: 0.08, 2: 0.11, 3: 0.15, 4: 0.2 },
  min: 0,
  max: 1,
  text: (value) => `Raid: +${value} crit chance`,
});
