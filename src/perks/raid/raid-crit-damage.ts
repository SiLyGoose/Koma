import { definePerk } from '../define.js';

/**
 * Raid: added to what the wearer's critical hits multiply damage by, as a share of a normal hit
 * (RAID_COMBAT.attack.critMultiplier, 2x): 60% makes crits 2.6x. Its own mechanic, in lib/events/raid.ts.
 */
export const raidCritDamage = definePerk({
  description: "Raid: added to the wearer's critical hit damage, as a share of a normal hit (60% turns the base 2x into 2.6x).",
  defaults: { 1: 0.25, 2: 0.4, 3: 0.6, 4: 0.8 },
  min: 0,
  max: 10,
  text: (value) => `Raid: +${value} crit damage`,
});
