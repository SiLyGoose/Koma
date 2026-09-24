import { claimBonus } from './claim-bonus.js';
import { claimTax } from './claim-tax.js';
import { d20 } from './d20/index.js';
import type { PerkDef } from './define.js';
import { fineReduction } from './fine-reduction.js';
import { glassCannonPenalty } from './glass-cannon-penalty.js';
import { glassCannon } from './glass-cannon.js';
import { pullDiscount } from './pull-discount.js';
import { robAmountCut } from './rob-amount-cut.js';
import { robAmount } from './rob-amount.js';
import { robChance } from './rob-chance.js';
import { robDefense } from './rob-defense.js';
import { robShield } from './rob-shield.js';
import { robTax } from './rob-tax.js';
import { slothCooldown } from './sloth-cooldown.js';
import { slothDefense } from './sloth-defense.js';
import { stackosaurus } from './stackosaurus.js';
import { wheelSpin } from './wheel-spin/index.js';
import type { Stars } from '../types.js';

/*
 * The perk registry: every perk (effect) an item can have, one file each in this folder. A perk
 * with extra machinery (the wheel, the D20) gets its own folder with an index.ts instead.
 *
 * An item lists the perks it has by id (see data/items.ts). A perk file holds everything about
 * that perk: its settings (description, defaults per star tier, limits), its gear-card text, and
 * the math that reads it from a member's totals. Rob math where several perks meet is in
 * rob-formulas.ts.
 *
 * To add a new perk:
 *   1. Create a file here (copy a similar perk) that exports `definePerk({ ... })`, plus any
 *      functions that read it from the totals.
 *   2. Add it to EFFECTS below. The key is the perk's id; its settings (equipment.<id>.<stars>),
 *      validation and config listing all come from this automatically.
 *   3. Give it to one or more items in data/items.ts.
 *   4. Call its function where it matters: services/economy/claim.ts for claims, rob.ts for
 *      robs, gacha.ts for pulls.
 * (Strengths are percentages of something; the settings show and accept them as "10%" or 0.1.)
 */

/** Every perk, by id. The order here is the order they are listed in the settings and on the gear summary. */
export const EFFECTS = {
  // Offense: the wearer robbing someone.
  robChance,
  robAmount,
  // Defense: someone robbing the wearer.
  robDefense,
  robShield,
  // Sid the Sloth.
  slothDefense,
  slothCooldown,
  // Caught protection.
  fineReduction,
  // Coughing Baby and Frog.
  robAmountCut,
  claimTax,
  robTax,
  // Glass cannon.
  glassCannon,
  glassCannonPenalty,
  // Unique-treasure perks.
  wheelSpin,
  d20,
  stackosaurus,
  // Economy.
  claimBonus,
  pullDiscount,
} as const satisfies Record<string, PerkDef>;

export type EffectId = keyof typeof EFFECTS;

export const EFFECT_IDS = Object.keys(EFFECTS) as EffectId[];

/** How strong each perk is per star tier, in the shape stored in the settings. */
export type EquipmentSettings = Record<EffectId, Record<Stars, number>>;

export function defaultEquipmentSettings(): EquipmentSettings {
  const out = {} as EquipmentSettings;
  for (const id of EFFECT_IDS) out[id] = { ...EFFECTS[id].defaults };
  return out;
}

/** The combined strength of each perk across everything a member has equipped. */
export type EffectTotals = Record<EffectId, number>;

export function emptyTotals(): EffectTotals {
  const out = {} as EffectTotals;
  for (const id of EFFECT_IDS) out[id] = 0;
  return out;
}

// Every perk's functions, so callers can import from one place.
export * from './claim-bonus.js';
export * from './claim-tax.js';
export * from './d20/index.js';
export * from './pull-discount.js';
export * from './rob-formulas.js';
export * from './rob-tax.js';
export * from './sloth-cooldown.js';
export * from './stackosaurus.js';
export * from './wheel-spin/index.js';
export type { PerkDef } from './define.js';
