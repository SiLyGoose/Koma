import { definePerk } from '../define.js';
import type { EffectTotals } from '../registry.js';

/*
 * MP5's perks. Burst fire: a rob rolls its success chance up to 1 + burstFire times and succeeds on
 * the first hit; only when every roll misses is the robber caught (and fined once). Recoil: every
 * one of those rolls is at a lower chance, a third more at R1 than at R5. Refining doesn't
 * change the number of rolls. The rolls happen in services/economy/rob.ts.
 */

/** How many times a rob by this gear rolls its success chance (1 without an MP5). */
export function robRolls(gear: Partial<EffectTotals>): number {
  return 1 + Math.max(0, Math.round(gear.burstFire ?? 0));
}

/** The chance that at least one of `rolls` rolls at `chance` each hits. */
export function anyRollHits(chance: number, rolls: number): number {
  return 1 - (1 - chance) ** Math.max(1, rolls);
}

export const burstFire = definePerk({
  description: 'Burst fire (MP5): extra times a rob by the wearer rolls its success chance. It succeeds if any roll hits; the wearer is only caught when all of them miss. Refining does not change it.',
  defaults: { 1: 1, 2: 1, 3: 1, 4: 2 },
  min: 0,
  max: 10,
  plain: true,
  atR1: 1,
  text: (value) => `Burst fire: ${value} extra tries at every rob`,
  line: (strength) => {
    const rolls = robRolls({ burstFire: strength });
    return `Burst fire: every rob gets ${rolls} tr${rolls === 1 ? 'y' : 'ies'} to succeed, and you're only caught if all of them miss`;
  },
});

export const burstRecoil = definePerk({
  description: "Burst fire (MP5), recoil: taken off the wearer's chance on every rob roll (percentage points), at R5. Twice that at R1, coming down as it is refined.",
  defaults: { 1: 0.2, 2: 0.175, 3: 0.15, 4: 0.1 },
  min: 0,
  max: 1,
  atR1: 2,
  text: (value) => `Recoil: -${value} rob success chance on every try`,
  modifies: { robChance: { add: (s) => -s } },
});
