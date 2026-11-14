import { definePerk } from '../define.js';

/*
 * The D20's perk: when the wearer claims or robs, the die may roll first and change the outcome. The
 * die itself is in roll.ts, its numbers (sides, bonus die, divisor) are D20 in constants/d20.ts, and the
 * picture is in animations/.
 */

export * from './roll.js';

export const d20 = definePerk({
  description:
    "Chance that the wearer's hourly claim or rob rolls the D20 first: a 1 is a sure fail that rolls a d3 (the claim pays nothing and the wearer pays the vault the claim times the d3; the rob is caught and its fine is multiplied by the d3),2 to 19 multiplies the claim or the rob's success chance by the roll divided by 10, and a 20 is a sure success that rolls a d3 and multiplies the claim or the take by it.",
  defaults: { 1: 0.25, 2: 0.5, 3: 0.75, 4: 1 },
  min: 0,
  max: 1,
  text: (value) =>
    `High Roller: ${value} of your claims and robs roll a D20 first. A 1 always fails and rolls a d3: you pay the vault your claim times it, or your rob fine is multiplied by it. 2 to 19 multiplies the claim or your rob chance by the roll divided by 10 (a 7 is 0.7x), and a 20 always succeeds and rolls a d3 that multiplies the claim or the take`,
  modifies: { d20Chance: { add: (s) => s } },
});
