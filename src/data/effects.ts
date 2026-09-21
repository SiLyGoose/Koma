import { CURRENCY_EMOJI, MAX_REDUCTION } from '../constants.js';
import type { Stars } from '../types.js';

/*
 * The effect registry: every effect an item can have.
 *
 * An item lists the effects it has (see data/items.ts). How strong an effect is depends only on
 * the item's star tier, and those numbers live in the settings as `equipment.<effect>.<stars>`
 * (for example `equipment.robChance.2`). The values below are just the starting defaults.
 *
 * To add a new effect later:
 *   1. Add an entry here. Its settings, defaults, validation and config listing all come from
 *      this entry automatically.
 *   2. Add its gear-card line to EFFECT_TEXT in constants.ts (the compiler reminds you).
 *   3. Give it to one or more items in data/items.ts.
 *   4. Use it where it matters: read the effect from the totals in lib/game/perks.ts (add a small
 *      function there) and call that function from the service that needs it.
 * Nothing else has to change. (Effects are percentages of something; the settings show and
 * accept them as "10%" or 0.1.)
 */

export interface EffectDef {
  /** What the setting does. Shown in the settings list. */
  description: string;
  /** Starting values for each star tier (fractions: 0.1 means 10%). */
  defaults: Record<Stars, number>;
  /** Limits for the setting, as fractions. */
  min: number;
  max: number;
}

export const EFFECTS = {
  // Offense: the wearer robbing someone.
  robChance: {
    description: "Added to the wearer's chance of a successful rob (percentage points).",
    defaults: { 1: 0.05, 2: 0.1, 3: 0.15, 4: 0.2 },
    min: 0,
    max: 1,
  },
  robAmount: {
    description: `Extra ${CURRENCY_EMOJI} the wearer steals on a successful rob, as a percent of the amount rolled.`,
    defaults: { 1: 0.1, 2: 0.2, 3: 0.3, 4: 0.4 },
    min: 0,
    max: 5,
  },

  // Defense: someone robbing the wearer.
  robDefense: {
    description: "Taken off the chance of a robber succeeding against the wearer (percentage points).",
    defaults: { 1: 0.05, 2: 0.1, 3: 0.15, 4: 0.2 },
    min: 0,
    max: 1,
  },
  robShield: {
    description: 'Percent of the stolen amount the wearer keeps when they are robbed successfully.',
    defaults: { 1: 0.1, 2: 0.15, 3: 0.2, 4: 0.25 },
    min: 0,
    max: MAX_REDUCTION,
  },

  // Sid the Sloth: much better protection from robbers, paid for with slower cooldowns. An item that
  // should be a sloth lists both effects. The protection stacks with robDefense.
  slothDefense: {
    description:
      "Sloth, protection: taken off the chance of a robber succeeding against the wearer (percentage points). Stacks with robDefense.",
    defaults: { 1: 0.1, 2: 0.2, 3: 0.3, 4: 0.4 },
    min: 0,
    max: 1,
  },
  slothCooldown: {
    description:
      "Sloth, cost: how much longer the wearer's rob and claim cooldowns are, as a percent (100% doubles them). The rob cooldown is stretched exactly; the claim resets on the hour, so its wait is counted in whole hours (100% makes it every second hour).",
    defaults: { 1: 0.25, 2: 0.5, 3: 0.75, 4: 1 },
    min: 0,
    max: 10,
  },

  // Caught protection: the wearer robbing and failing.
  fineReduction: {
    description: 'Percent of the fine waived when the wearer is caught robbing.',
    defaults: { 1: 0.1, 2: 0.15, 3: 0.2, 4: 0.25 },
    min: 0,
    max: 1,
  },

  // Coughing baby and frog: a weaker rob (robAmountCut), paired with a tax on something the
  // victim does next. The baby taxes their next claim, the frog their next successful rob.
  robAmountCut: {
    description: `Percent cut from the ${CURRENCY_EMOJI} the wearer steals on a successful rob (25% means 75% of the amount).`,
    defaults: { 1: 0.0625, 2: 0.125, 3: 0.1875, 4: 0.25 },
    min: 0,
    max: MAX_REDUCTION,
  },
  claimTax: {
    description:
      "Percent of the victim's next hourly claim that is taken and paid to the wearer, after the wearer robs them successfully.",
    defaults: { 1: 0.0625, 2: 0.125, 3: 0.1875, 4: 0.25 },
    min: 0,
    max: 1,
  },
  robTax: {
    description:
      `Percent of the ${CURRENCY_EMOJI} the victim steals on their next successful rob that are taken and paid to the wearer, after the wearer robs them successfully.`,
    defaults: { 1: 0.0625, 2: 0.125, 3: 0.1875, 4: 0.25 },
    min: 0,
    max: 1,
  },

  // Risk and reward, the glass cannon pair: the wearer steals more, but pays much more when caught.
  // An item that should be a glass cannon lists both effects.
  glassCannon: {
    description:
      `Glass cannon, reward: extra ${CURRENCY_EMOJI} the wearer steals on a successful rob, as a percent of the amount rolled (100% is 2x). Stacks with robAmount.`,
    defaults: { 1: 0.5, 2: 1, 3: 1.5, 4: 2 },
    min: 0,
    max: 5,
  },
  glassCannonPenalty: {
    description:
      'Glass cannon, risk: extra fine the wearer pays when caught robbing, as a percent of the normal fine (150% is 2.5x).',
    defaults: { 1: 0.75, 2: 1, 3: 1.25, 4: 1.5 },
    min: 0,
    max: 10,
  },

  // The Wheelchair's wheel: when the wearer claims or robs successfully, the wheel (data/wheel.ts)
  // may spin and multiply the points.
  wheelSpin: {
    description:
      `Chance that the wearer's hourly claim or successful rob spins the wheel (data/wheel.ts), which multiplies the ${CURRENCY_EMOJI}.`,
    defaults: { 1: 0.25, 2: 0.5, 3: 0.75, 4: 1 },
    min: 0,
    max: 1,
  },

  // The D20's die: when the wearer claims, the D20 (constants.ts) may roll and change the claim.
  d20: {
    description:
      "Chance that the wearer's hourly claim rolls the D20: a 1 pays nothing, 2 to 19 multiplies the claim by the roll divided by 10, and a 20 pays double and allows one more claim that hour.",
    defaults: { 1: 0.25, 2: 0.5, 3: 0.75, 4: 1 },
    min: 0,
    max: 1,
  },

  // Economy perks.
  claimBonus: {
    description: `Extra ${CURRENCY_EMOJI} on the wearer's hourly claim, as a percent.`,
    defaults: { 1: 0.05, 2: 0.1, 3: 0.2, 4: 0.3 },
    min: 0,
    max: 10,
  },
  pullDiscount: {
    description: 'Percent taken off the cost of a gacha pull.',
    defaults: { 1: 0.05, 2: 0.1, 3: 0.15, 4: 0.2 },
    min: 0,
    max: MAX_REDUCTION,
  },
} as const satisfies Record<string, EffectDef>;

export type EffectId = keyof typeof EFFECTS;

export const EFFECT_IDS = Object.keys(EFFECTS) as EffectId[];

/** How strong each effect is per star tier, in the shape stored in the settings. */
export type EquipmentSettings = Record<EffectId, Record<Stars, number>>;

export function defaultEquipmentSettings(): EquipmentSettings {
  const out = {} as EquipmentSettings;
  for (const id of EFFECT_IDS) out[id] = { ...EFFECTS[id].defaults };
  return out;
}

/** The combined strength of each effect across everything a member has equipped. */
export type EffectTotals = Record<EffectId, number>;

export function emptyTotals(): EffectTotals {
  const out = {} as EffectTotals;
  for (const id of EFFECT_IDS) out[id] = 0;
  return out;
}
