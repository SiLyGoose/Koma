import { bubbleBeam, bubbleBeamMasterPenalty, bubbleBeamPenalty, slipGuard } from './items/bubble-beam.js';
import { claimBonus } from './economy/claim-bonus.js';
import { claimTax } from './rob/claim-tax.js';
import { d20 } from './d20/index.js';
import type { PerkDef } from './define.js';
import { fineReduction } from './rob/fine-reduction.js';
import { glassCannonPenalty } from './items/glass-cannon-penalty.js';
import { glassCannon } from './items/glass-cannon.js';
import { guardBoost } from './raid/guard-boost.js';
import { healCut } from './raid/heal-cut.js';
import { healSplash } from './raid/heal-splash.js';
import { iconicByMistake } from './items/iconic-by-mistake.js';
import { maxHpDamage } from './raid/max-hp-damage.js';
import { blastLoss, dynamiteBlast, energyRegen, freeDig, luckyOre, oreValueCut, pickaxeEnergyPenalty, pickaxeSpeed } from './pinecraft/index.js';
import { pullDiscount } from './economy/pull-discount.js';
import { robStreak, robStreakCap, robVulnerable } from './items/thoccy.js';
import { burstFire, burstRecoil } from './items/mp5.js';
import { rallyBoost } from './raid/rally-boost.js';
import { robAmountCut } from './rob/rob-amount-cut.js';
import { robAmount } from './rob/rob-amount.js';
import { robChance } from './rob/rob-chance.js';
import { robDefense } from './rob/rob-defense.js';
import { robShield } from './rob/rob-shield.js';
import { robTax } from './rob/rob-tax.js';
import { wealthTax } from './rob/wealth-tax.js';
import { slothCooldown } from './items/sloth-cooldown.js';
import { slothDefense } from './items/sloth-defense.js';
import { smart } from './items/smart.js';
import { stackosaurus } from './items/stackosaurus.js';
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
  wealthTax,
  // Glass cannon.
  glassCannon,
  glassCannonPenalty,
  // Chaewon Photocard.
  smart,
  iconicByMistake,
  // Piplup.
  bubbleBeam,
  bubbleBeamPenalty,
  // Piplup's masterwork bonus.
  bubbleBeamMasterPenalty,
  slipGuard,
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
  // Thoccy Keyboard.
  robStreak,
  robStreakCap,
  robVulnerable,
  // MP5.
  burstFire,
  burstRecoil,
  // Pinecraft.
  pickaxeSpeed,
  pickaxeEnergyPenalty,
  dynamiteBlast,
  blastLoss,
  luckyOre,
  energyRegen,
  freeDig,
  oreValueCut,
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
