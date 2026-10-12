import { definePerk } from '../define.js';

/**
 * Raid, a knight's: how much more of the hits on everyone else the wearer's Guard cuts, on top of the
 * knight's own share (RAID_CLASSES.knight.partyCut: 20% more turns a knight's 10% into 30%). It does
 * nothing for any other class, whose guards cut nothing for the party. Its own mechanic, in
 * lib/events/raid.ts (guardCutOf).
 */
export const partyGuard = definePerk({
  description: "Raid, knights only: how much more a knight's Guard cuts for the whole party against moves that hit several raiders (20% turns their 10% into 30%).",
  defaults: { 1: 0.05, 2: 0.1, 3: 0.15, 4: 0.2 },
  min: 0,
  max: 1,
  text: (value) => `Raid (Knight): your Guard cuts hits on the whole party by ${value} more`,
});
