import { definePerk } from './define.js';

/** Defense: robbers are less likely to succeed against the wearer. */
export const robDefense = definePerk({
  description: 'Taken off the chance of a robber succeeding against the wearer (percentage points).',
  defaults: { 1: 0.05, 2: 0.075, 3: 0.1, 4: 0.15 },
  min: 0,
  max: 1,
  text: (value) => `-${value} chance of being robbed`,
  modifies: { robChance: { whose: 'target', add: (s) => -s } },
});
