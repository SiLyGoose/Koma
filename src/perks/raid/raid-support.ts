import { definePerk } from '../define.js';

/**
 * Raid: the wearer's heals (and revives, and a heal splash's share of them) heal this much more, and
 * their Guard blocks this much more (of their own hits and of the party's cut), added to guardBoost's (25% turns a 30 HP
 * heal into 37, and taking 50% of a hit into 37.5%). Its own mechanic, in lib/events/raid.ts.
 */
export const raidSupport = definePerk({
  description: "Raid: how much more the wearer's heals heal, and how much more their Guard blocks, for them and the party (adds to guardBoost).",
  defaults: { 1: 0.1, 2: 0.15, 3: 0.25, 4: 0.35 },
  min: 0,
  max: 10,
  text: (value) => `Raid: heals heal ${value} more, and your Guard blocks ${value} more, for you and the party`,
});
