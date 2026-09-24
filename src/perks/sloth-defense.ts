import { definePerk } from './define.js';

/**
 * Sid the Sloth, protection half: much better protection from robbers, paid for with slower
 * cooldowns (sloth-cooldown.ts). An item that should be a sloth lists both perks. Stacks with
 * robDefense.
 */
export const slothDefense = definePerk({
  description:
    'Sloth, protection: taken off the chance of a robber succeeding against the wearer (percentage points). Stacks with robDefense.',
  defaults: { 1: 0.1, 2: 0.2, 3: 0.3, 4: 0.4 },
  min: 0,
  max: 1,
  text: (value) => `Sloth: -${value} chance of being robbed`,
  modifies: { robChance: { whose: 'target', add: (s) => -s } },
});
