import { definePerk } from './define.js';

/** Sid the Sloth, cost half: the wearer's rob and claim cooldowns are longer (see sloth-defense.ts). */
export const slothCooldown = definePerk({
  description:
    "Sloth, cost: how much longer the wearer's rob and claim cooldowns are, as a percent (100% doubles them). The rob cooldown is stretched exactly; the claim resets on the hour, so its wait is counted in whole hours (100% makes it every second hour).",
  defaults: { 1: 0.25, 2: 0.5, 3: 0.75, 4: 1 },
  min: 0,
  max: 10,
  text: (value) => `Sloth: +${value} rob and claim cooldowns`,
  // Never shorter than normal, whatever the setting says.
  modifies: { cooldownScale: { add: (s) => Math.max(0, s) } },
});
