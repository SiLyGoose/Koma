import { bubbleBeam, bubbleBeamPenalty } from './bubble-beam.js';
import { claimBonus } from './claim-bonus.js';
import { claimTax } from './claim-tax.js';
import { d20 } from './d20/index.js';
import type { PerkDef } from './define.js';
import { fineReduction } from './fine-reduction.js';
import { glassCannonPenalty } from './glass-cannon-penalty.js';
import { glassCannon } from './glass-cannon.js';
import { guardBoost } from './guard-boost.js';
import { healCut } from './heal-cut.js';
import { healSplash } from './heal-splash.js';
import { iconicByMistake } from './iconic-by-mistake.js';
import { maxHpDamage } from './max-hp-damage.js';
import { pullDiscount } from './pull-discount.js';
import { rallyBoost } from './rally-boost.js';
import { robAmountCut } from './rob-amount-cut.js';
import { robAmount } from './rob-amount.js';
import { robChance } from './rob-chance.js';
import { robDefense } from './rob-defense.js';
import { robShield } from './rob-shield.js';
import { robTax } from './rob-tax.js';
import { slothCooldown } from './sloth-cooldown.js';
import { slothDefense } from './sloth-defense.js';
import { smart } from './smart.js';
import { stackosaurus } from './stackosaurus.js';
import { wheelSpin } from './wheel-spin/index.js';
import type { Stars } from '../types.js';
import { registerPerks } from './stats.js';

/*
 * Every perk by id, and the shapes built from that list. Kept apart from index.ts so stats.ts can
 * read the registry without importing everything the index re-exports.
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
  // Chaewon Photocard.
  smart,
  iconicByMistake,
  // Piplup.
  bubbleBeam,
  bubbleBeamPenalty,
  // Unique-treasure perks.
  wheelSpin,
  d20,
  stackosaurus,
  // Economy.
  claimBonus,
  pullDiscount,
  // Raid battles.
  healSplash,
  guardBoost,
  rallyBoost,
  maxHpDamage,
  healCut,
} as const satisfies Record<string, PerkDef>;

registerPerks(EFFECTS);

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
