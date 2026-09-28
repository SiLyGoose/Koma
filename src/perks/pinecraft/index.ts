import { CURRENCY_EMOJI } from '../../constants/index.js';
import { definePerk } from '../define.js';

/*
 * Pinecraft's perks (lib/game/pinecraft.ts reads them through pinecraftGear). None of them changes
 * one of the numbers in stats.ts: each is a Pinecraft mechanic, worked out where it happens.
 */

/** "1st", "2nd", "3rd", "10th". */
const ordinal = (n: number): string => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
};

/** Golden Pickaxe: blocks break faster (50% faster takes 2/3 as long). 25% at R1. */
export const pickaxeSpeed = definePerk({
  description: 'Pinecraft: how much faster the wearer breaks blocks (50% faster takes 2/3 as long). Half as much at R1.',
  defaults: { 1: 0.2, 2: 0.5, 3: 2, 4: 4 },
  min: 0,
  max: 10,
  atR1: 0.5,
  text: (value) => `Pinecraft: breaks blocks ${value} faster`,
});

/** Golden Pickaxe, drawback: an ore takes more energy to dig. The setting is the extra at R5 (1: 2 energy); R1 is 5 times that. */
export const pickaxeEnergyPenalty = definePerk({
  description: 'Pinecraft: extra energy each ore takes the wearer to dig, at R5 (1 makes it 2). Five times as much at R1, coming down as it is refined.',
  defaults: { 1: 3, 2: 2, 3: 1, 4: 1 },
  min: 0,
  max: 100,
  plain: true,
  atR1: 5,
  text: (value) => `Pinecraft: ores take ${value} more energy`,
  line: (strength) => `Pinecraft: ores take ${1 + oreEnergyExtra(strength)} ⚡ each to dig`,
});

/** The whole extra energy an ore takes, from pickaxeEnergyPenalty's strength (rounded down, so R1 to R5 go 6, 5, 4, 3, 2 with the defaults). */
export const oreEnergyExtra = (strength: number): number => Math.max(0, Math.floor(strength + 1e-9));

/** Dynamite Stick: every so many blocks dug, the one dug blows up the blocks around it. The setting is the count at R5; R1 is twice it. */
export const dynamiteBlast = definePerk({
  description: 'Pinecraft: every this many blocks the wearer digs, the one dug blows up the 8 blocks around it (for no extra energy), at R5. Twice as many at R1.',
  defaults: { 1: 10, 2: 10, 3: 10, 4: 10 },
  min: 2,
  max: 1000,
  plain: true,
  atR1: 2,
  text: (value) => `Pinecraft: a blast every ${value} blocks`,
  line: (strength) => `Pinecraft: every ${ordinal(blastEvery(strength))} block dug blows up the blocks around it`,
});

/** How many blocks apart the blasts are, from dynamiteBlast's strength (0: none). */
export const blastEvery = (strength: number): number => (strength > 0 ? Math.max(2, Math.round(strength)) : 0);

/** Dynamite Stick, drawback: ores caught in a blast pay less. The same at every refine level. */
export const blastLoss = definePerk({
  description: `Pinecraft: how much less ${CURRENCY_EMOJI} an ore pays when a blast breaks it (the ore dug itself pays in full). Refining doesn't change it.`,
  defaults: { 1: 0.5, 2: 0.5, 3: 0.5, 4: 0.5 },
  min: 0,
  max: 1,
  atR1: 1,
  text: (value) => `Pinecraft: ores caught in a blast pay ${value} less`,
});

/** Lucky Rabbit's Foot: a chance an ore pays double. */
export const luckyOre = definePerk({
  description: `Pinecraft: chance each ore the wearer digs pays double ${CURRENCY_EMOJI}.`,
  defaults: { 1: 0.1, 2: 0.1, 3: 0.1, 4: 0.1 },
  min: 0,
  max: 1,
  text: (value) => `Pinecraft: ${value} chance an ore pays double`,
});

/** Canary in a Cage: energy comes back faster (100% faster is twice as fast). */
export const energyRegen = definePerk({
  description: "Pinecraft: how much faster the wearer's energy comes back (100% is twice as fast).",
  defaults: { 1: 1, 2: 1, 3: 1, 4: 1 },
  min: 0,
  max: 10,
  text: (value) => `Pinecraft: energy comes back ${value} faster`,
});
