import { definePerk } from './define.js';

/** Chaewon Photocard, risk half (see smart.ts): robbers are more likely to succeed against the wearer. */
export const iconicByMistake = definePerk({
  description:
    'ICONIC BY MISTAKE: added to the chance of a robber succeeding against the wearer (percentage points). Offsets robDefense.',
  defaults: { 1: 0.05, 2: 0.08, 3: 0.12, 4: 0.15 },
  min: 0,
  max: 1,
  text: (value) => `ICONIC BY MISTAKE: +${value} chance of being robbed`,
  modifies: { robChance: { whose: 'target', add: (s) => s } },
});
