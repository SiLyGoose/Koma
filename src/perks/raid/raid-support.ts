import { definePerk } from '../define.js';

/**
 * Raid: the wearer's heals (and revives, and a heal splash's share of them) heal this much more (25%
 * turns a 30 HP heal into 37). Guard is guardBoost's job, not this one's. Its own mechanic, in
 * lib/events/raid.ts.
 */
export const raidSupport = definePerk({
  description: "Raid: how much more the wearer's heals and revives heal.",
  defaults: { 1: 0.1, 2: 0.15, 3: 0.25, 4: 0.35 },
  min: 0,
  max: 10,
  text: (value) => `Raid: your heals and revives heal ${value} more`,
});
