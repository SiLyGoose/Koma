import { definePerk } from './define.js';

/**
 * Raid: while the wearer is standing, the boss heals this share less (the Soul Reaper's lifesteal).
 * It doesn't stack: the strongest cut among the raiders still standing is the one that counts. Its
 * own mechanic, in lib/events/raid.ts.
 */
export const healCut = definePerk({
  description: 'Raid: the boss heals this share less while the wearer is standing. Only the strongest in the party counts; they do not stack.',
  defaults: { 1: 0.1, 2: 0.15, 3: 0.25, 4: 0.35 },
  min: 0,
  max: 1,
  text: (value) => `Raid: the boss heals ${value} less while you're standing`,
});
