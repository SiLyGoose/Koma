import { definePerk } from '../define.js';

/**
 * Raid: the wearer's heals (and revives, and a heal splash's share of them) heal this much more, on
 * top of raidSupport. A smaller cousin of raidSupport, for an item whose main perk is something else
 * (the Plague Doctor's Cane). Its own mechanic, in lib/events/raid.ts.
 */
export const healBonus = definePerk({
  description: "Raid: how much more the wearer's heals and revives heal, added to raidSupport. Smaller than raidSupport, for items that do something else as well.",
  defaults: { 1: 0.025, 2: 0.05, 3: 0.075, 4: 0.1 },
  min: 0,
  max: 10,
  text: (value) => `Raid: your heals and revives heal ${value} more`,
});
