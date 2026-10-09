import { definePerk } from '../define.js';

/**
 * Raid: when the wearer's Support clears the Plague Matriarch's Blight, it also clears it from a second
 * blighted ally, and takes this many more stacks off each. The setting is the extra stacks at R5, and
 * the refined share of it is rounded down (blightPurgeExtra), so the 4-star default of 3 goes 0, 1, 1,
 * 2, 3 from R1 to R5 (a Support clears up to 4 stacks off each at R5). Its own mechanic, in
 * lib/events/raid.ts.
 */
export const blightPurge = definePerk({
  description:
    "Raid: when the wearer's Support clears 🦠 Blight, it also clears a second ally's and takes this many more stacks off each, at R5 (rounded down, so 3 goes 0, 1, 1, 2, 3 from R1 to R5).",
  defaults: { 1: 1, 2: 1, 3: 2, 4: 3 },
  min: 0,
  max: 8,
  plain: true,
  text: (value) => `Raid: your Support clears ${value} more 🦠 Blight stacks, from a second ally too`,
  line: (strength) => {
    const extra = blightPurgeExtra(strength);
    return `Raid: your Support clears 🦠 Blight from a second ally too${extra > 0 ? `, and ${extra} more ${extra === 1 ? 'stack' : 'stacks'} off each` : ''}`;
  },
});

/** The extra Blight stacks a Support clears off each ally, from blightPurge's strength (rounded down). */
export const blightPurgeExtra = (strength: number): number => Math.max(0, Math.floor(strength + 1e-9));
