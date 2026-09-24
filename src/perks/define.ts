import type { Settings } from '../config.js';
import type { Stars } from '../types.js';
import type { StatId, StatModifier } from './stats.js';

/**
 * The shape every perk file exports (see perks/index.ts for how to add one).
 *
 * How strong a perk is depends only on the item's star tier, and those numbers live in the
 * settings as `equipment.<perk id>.<stars>` (for example `equipment.robChance.2`). `defaults` are
 * just the starting values. Strengths are fractions: 0.1 means 10%.
 */
export interface PerkDef {
  /** What the setting does. Shown in the settings list. */
  description: string;
  /** Starting values for each star tier (fractions: 0.1 means 10%). */
  defaults: Record<Stars, number>;
  /** Limits for the setting, as fractions. */
  min: number;
  max: number;
  /** The perk's line on the gear card. `value` is its strength already formatted, like "10%". */
  text: (value: string) => string;
  /**
   * Optional: a gear-card line built from the raw strength and the live settings, for a perk whose
   * line is more than "text at N%" (STONKS!'s hour-by-hour curve). Used instead of `text` when set.
   */
  line?: (strength: number, settings: Settings) => string;
  /**
   * The numbers this perk changes, and how (see stats.ts for the list and how they are worked
   * out). A perk that only changes numbers needs no other code: every claim, rob and pull picks
   * it up. A perk that is its own mechanic (the wheel, the D20, STONKS!'s clock) can still list the
   * numbers it changes here (like its chance), but the mechanic itself is called where it happens.
   */
  modifies?: Partial<Record<StatId, StatModifier>>;
}

/** Declares a perk. Only checks the shape; the perk is returned unchanged. */
export function definePerk<T extends PerkDef>(perk: T): T {
  return perk;
}

export const clamp = (n: number, low: number, high: number): number => Math.min(high, Math.max(low, n));
