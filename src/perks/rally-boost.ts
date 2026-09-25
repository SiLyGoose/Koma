import { definePerk } from './define.js';

/**
 * Raid: a rally from the wearer's Support gives this much more attack bonus (25% turns +50% attack
 * into +62.5%). Lifting curses and breaking the shield are unchanged. Its own mechanic, in
 * lib/events/raid.ts.
 */
export const rallyBoost = definePerk({
  description: "Raid: how much bigger the attack bonus is when the wearer's Support rallies the party (25% turns +50% attack into +62.5%).",
  defaults: { 1: 0.1, 2: 0.15, 3: 0.25, 4: 0.35 },
  min: 0,
  max: 10,
  text: (value) => `Raid: your rallies give a ${value} bigger attack bonus`,
});
