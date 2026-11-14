import { definePerk } from '../define.js';

/**
 * Raid: the wearer's Guard blocks this much more: of the hits they take (25% more turns taking half
 * a hit into taking 37.5%), and, for a class whose Guard cuts for the party (a knight), of that cut
 * too (only the strongest guard's cut counts). Its own mechanic, in lib/events/raid.ts.
 */
export const guardBoost = definePerk({
  description: "Raid: how much more the wearer's Guard blocks (25% turns taking 50% of a hit into 37.5%). A knight's cut for the party grows by the same share.",
  defaults: { 1: 0.1, 2: 0.15, 3: 0.2, 4: 0.3 },
  min: 0,
  max: 1,
  text: (value) => `Raid: your Guard blocks ${value} more`,
});
