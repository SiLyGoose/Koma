import { definePerk } from '../define.js';

/**
 * Longer cooldowns, the price of a strong perk: Sid the Sloth's (paired with sloth-defense.ts) and
 * the Wheelchair's (paired with its wheel). One setting for both, so they always cost the same.
 */
export const slothCooldown = definePerk({
  description:
    "Slower cooldowns (Sid the Sloth, Wheelchair): how much longer the wearer's rob and claim cooldowns are, as a percent (100% doubles them). The rob cooldown is stretched exactly; the claim resets on the hour, so its wait is counted in whole hours (100% makes it every second hour).",
  defaults: { 1: 0.25, 2: 0.5, 3: 0.75, 4: 1 },
  min: 0,
  max: 10,
  // No "Sloth:" here: the Wheelchair wears it too.
  text: (value) => `Debuff: +${value} rob and claim cooldowns`,
  // Never shorter than normal, whatever the setting says.
  modifies: { cooldownScale: { add: (s) => Math.max(0, s) } },
});
