import { definePerk } from '../define.js';

/**
 * Raid: the wearer starts a raid with this much more HP (and can be healed up to it): 30% turns
 * 100 HP into 130. Its own mechanic, set when the fight starts (commands/raid.ts, lib/events/raid.ts playerMaxHp).
 */
export const raidHp = definePerk({
  description: "Raid: how much more HP the wearer fights with, on top of raid.playerHp (30% turns 100 HP into 130).",
  defaults: { 1: 0.1, 2: 0.2, 3: 0.3, 4: 0.4 },
  min: 0,
  max: 10,
  text: (value) => `Raid: +${value} HP`,
});
