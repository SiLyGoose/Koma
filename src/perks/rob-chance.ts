import { definePerk } from './define.js';

/** Offense: the wearer's chance of a successful rob goes up. Used in rob-formulas.ts robSuccessChance. */
export const robChance = definePerk({
  description: "Added to the wearer's chance of a successful rob (percentage points).",
  defaults: { 1: 0.05, 2: 0.1, 3: 0.15, 4: 0.2 },
  min: 0,
  max: 1,
  text: (value) => `+${value} rob success chance`,
});
