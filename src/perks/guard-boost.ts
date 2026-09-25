import { definePerk } from './define.js';

/**
 * Raid: the wearer's Guard blocks this much more of the hits they take (25% more turns taking half
 * a hit into taking 37.5%). Only the wearer's own damage; the cut they give the party stays the
 * same. Its own mechanic, in lib/events/raid.ts.
 */
export const guardBoost = definePerk({
  description: "Raid: how much more of a hit the wearer's Guard blocks, for the wearer only (25% turns taking 50% of a hit into 37.5%).",
  defaults: { 1: 0.1, 2: 0.15, 3: 0.25, 4: 0.35 },
  min: 0,
  max: 1,
  text: (value) => `Raid: Guard blocks ${value} more of the hits you take`,
});
