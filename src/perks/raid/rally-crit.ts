import { definePerk } from '../define.js';

/**
 * Raid, a mechanic's: while a rally the wearer made is running, every raider's crit chance is this
 * much higher (their attacks', and a priest's heals'). It does nothing for any other class. Its own
 * mechanic, in lib/events/raid.ts.
 */
export const rallyCrit = definePerk({
  description: "Raid, mechanics only: how much higher every raider's crit chance is while a mechanic's rally is running.",
  defaults: { 1: 0.04, 2: 0.07, 3: 0.1, 4: 0.15 },
  min: 0,
  max: 1,
  text: (value) => `Raid (Mechanic): while your rally lasts, the party's crit chance is ${value} higher`,
});
