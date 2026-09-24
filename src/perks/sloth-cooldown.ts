import { definePerk } from './define.js';
import type { EffectTotals } from './index.js';

/** Sid the Sloth, cost half: the wearer's rob and claim cooldowns are longer (see sloth-defense.ts). */
export const slothCooldown = definePerk({
  description:
    "Sloth, cost: how much longer the wearer's rob and claim cooldowns are, as a percent (100% doubles them). The rob cooldown is stretched exactly; the claim resets on the hour, so its wait is counted in whole hours (100% makes it every second hour).",
  defaults: { 1: 0.25, 2: 0.5, 3: 0.75, 4: 1 },
  min: 0,
  max: 10,
  text: (value) => `Sloth: +${value} rob and claim cooldowns`,
});

/** How many times longer the wearer's rob cooldown is (1 with no sloth gear, 2 at +100%). */
export function robCooldownScale(gear: Pick<EffectTotals, 'slothCooldown'>): number {
  return 1 + Math.max(0, gear.slothCooldown);
}

/**
 * How many clock hours the wearer waits between claims. The claim resets on the hour, so the
 * extra wait is counted in whole hours: 1 normally, 2 at +100% (every second hour). Never below 1.
 */
export function claimGapHours(gear: Pick<EffectTotals, 'slothCooldown'>): number {
  return Math.max(1, Math.round(robCooldownScale(gear)));
}
