import { definePerk } from '../define.js';

/**
 * Raid: the wearer's Guard blocks this much more: of the hits they take (25% more turns taking half
 * a hit into taking 37.5%), and of the cut it gives the party against moves that hit several raiders
 * (30% into 37.5%; only the strongest guard's cut counts). Its own mechanic, in lib/events/raid.ts.
 */
export const guardBoost = definePerk({
  description: "Raid: how much more the wearer's Guard blocks, for them and for the party (25% turns taking 50% of a hit into 37.5%, and the party's 30% cut into 37.5%).",
  defaults: { 1: 0.1, 2: 0.15, 3: 0.25, 4: 0.35 },
  min: 0,
  max: 1,
  text: (value) => `Raid: your Guard blocks ${value} more, for you and the party`,
});
