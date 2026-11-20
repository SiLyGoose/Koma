import { clamp, definePerk } from '../define.js';

/*
 * Pot of Greed: a gacha pull can give a second item, and every pull costs more. The second item is
 * rolled where the pulls are (lib/game/items/gacha.ts rollPulls); the cost is a number like any other.
 */

/** Pot of Greed: a chance each pull gives a second item. 40% of it at R1. */
export const potOfGreed = definePerk({
  description: 'Chance each gacha pull gives a second item for nothing (a plain roll: it gets no pity and counts for none). 40% of it at R1.',
  defaults: { 1: 0.25, 2: 0.25, 3: 0.25, 4: 0.25 },
  min: 0,
  max: 1,
  atR1: 0.4,
  text: (value) => `${value} chance a gacha pull gives a second item`,
});

/** Pot of Greed, drawback: pulls cost more. The same at every refine level. */
export const greedCost = definePerk({
  description: "Percent added to the cost of a gacha pull. Refining doesn't change it.",
  defaults: { 1: 0.5, 2: 0.5, 3: 0.5, 4: 0.5 },
  min: 0,
  max: 10,
  atR1: 1,
  text: (value) => `+${value} gacha pull cost`,
  modifies: { pullCost: { factor: (s) => 1 + s } },
});

/** The chance (0 to 1) a pull in this gear gives a second item, from potOfGreed's total strength. */
export const extraPullChance = (gear: { potOfGreed?: number }): number => clamp(gear.potOfGreed ?? 0, 0, 1);
