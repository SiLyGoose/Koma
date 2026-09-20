import { MAX_REDUCTION } from '../constants.js';
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
 *   4. Use it where it matters: read the effect from the totals in lib/perks.ts (add a small
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
    description: 'Extra points the wearer steals on a successful rob, as a percent of the amount rolled.',
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
    defaults: { 1: 0.1, 2: 0.2, 3: 0.3, 4: 0.4 },
    min: 0,
    max: MAX_REDUCTION,
  },

  // Caught protection: the wearer robbing and failing.
  fineReduction: {
    description: 'Percent of the fine waived when the wearer is caught robbing.',
    defaults: { 1: 0.25, 2: 0.5, 3: 0.75, 4: 1 },
    min: 0,
    max: 1,
  },

  // Economy perks.
  claimBonus: {
    description: 'Extra points on the wearer\'s hourly claim, as a percent.',
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
