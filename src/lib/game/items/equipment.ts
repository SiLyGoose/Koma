import { CONFIG } from '../../../config.js';
import { ADMIN_USER_ID } from '../../../constants/index.js';
import { EFFECT_IDS, EFFECTS, emptyTotals, type EffectId, type EffectTotals, type PerkDef } from '../../../perks/index.js';
import { ITEMS_BY_ID } from '../../../data/items.js';
import { SLOTS, type GearIds, type ItemDef, type Stars } from '../../../types.js';
import { formatPercent } from '../../format.js';
import { refineShare } from './refine.js';
import { REFINE, TEXT } from '../../../constants/index.js';

/**
 * How much of a perk's full strength a copy at this refinement level gives: the usual refine share,
 * or, for a perk with its own R1 value (`atR1`), a climb from that to full in the same steps.
 */
export function perkShare(effect: EffectId, level: number): number {
  const share = refineShare(level);
  const atR1: number | undefined = (EFFECTS[effect] as PerkDef).atR1;
  const lowest = refineShare(1);
  if (atR1 === undefined || lowest >= 1) return share;
  return atR1 + ((1 - atR1) * (share - lowest)) / (1 - lowest);
}

/** How strong an effect is on an item of the given star tier, from the live settings. */
export function effectStrength(effect: EffectId, stars: Stars): number {
  return CONFIG.equipment[effect][stars];
}

/**
 * Where a copy of `item` stands with the item's bonus: the item has none, the copy isn't refined far
 * enough yet, it is but isn't a masterwork (bought with komaGems), or it is and the bonus is on.
 */
export function bonusState(item: ItemDef, level: number, masterwork: boolean): 'none' | 'too_low' | 'dormant' | 'masterwork' {
  if (!item.bonus) return 'none';
  if (level < item.bonus.level) return 'too_low';
  return masterwork ? 'masterwork' : 'dormant';
}

/** Whether a copy of `item` at this refinement level has its bonus on (refined far enough, and a masterwork). */
export function bonusActive(item: ItemDef, level: number, masterwork: boolean): boolean {
  return bonusState(item, level, masterwork) === 'masterwork';
}

/** The perks an item gives at a refinement level: its own, changed by its refine bonus once that is on. */
export function itemEffects(item: ItemDef, level: number, masterwork: boolean): EffectId[] {
  if (!item.bonus || !bonusActive(item, level, masterwork)) return [...item.effects];
  const removes = item.bonus.removes ?? [];
  return [...item.effects.filter((effect) => !removes.includes(effect)), ...(item.bonus.adds ?? [])];
}

/** One equipped item, the refinement level of the copy worn, and whether that copy is a masterwork (left out: yes). */
export interface GearPiece {
  item: ItemDef;
  level: number;
  bonus?: boolean;
}

/**
 * The catalog items a member has equipped, with each copy's refinement level (fully refined when
 * the gear doesn't say). Ids that are no longer in the catalog, or that sit in the wrong slot (say
 * the catalog changed), are ignored rather than trusted.
 */
export function equippedGear(equipment: GearIds | null | undefined): GearPiece[] {
  const pieces: GearPiece[] = [];
  for (const slot of SLOTS) {
    const id = equipment?.[slot];
    if (!id) continue;
    const item = ITEMS_BY_ID.get(id);
    if (item && item.slot === slot) pieces.push({ item, level: equipment?.levels?.[slot] ?? REFINE.maxLevel, bonus: equipment?.bonuses?.[slot] ?? true });
  }
  return pieces;
}

/** Just the equipped items (see equippedGear). */
export function equippedItems(equipment: GearIds | null | undefined): ItemDef[] {
  return equippedGear(equipment).map((piece) => piece.item);
}

/**
 * Whether `userId` gets this item's effects. Items with no `usableBy` list work for everyone;
 * otherwise only the listed users, plus the admin (who can use everything, to test with).
 */
export function canUseItem(item: ItemDef, userId: string): boolean {
  if (!item.usableBy) return true;
  return userId === ADMIN_USER_ID || item.usableBy.includes(userId);
}

/**
 * How much of an item's effects `userId` gets (1 is all of it): everything from an item they can
 * use, and equipment.borrowed.effectiveness from someone else's exclusive item (a borrowed unique treasure).
 */
export function itemEffectiveness(item: ItemDef, userId: string): number {
  return canUseItem(item, userId) ? 1 : CONFIG.equipment.borrowed.effectiveness;
}

/**
 * Adds up every effect across the given gear. Each piece counts at its refinement level's share
 * (perkShare); a bare item counts as fully refined. With `userId`, each also counts at the share
 * of its effects that member gets (itemEffectiveness); without it, in full.
 */
export function totalEffects(gear: readonly (ItemDef | GearPiece)[], userId?: string): EffectTotals {
  const totals = emptyTotals();
  for (const piece of gear) {
    const { item, level, bonus = true } = 'item' in piece ? piece : { item: piece, level: REFINE.maxLevel };
    const share = userId === undefined ? 1 : itemEffectiveness(item, userId);
    for (const effect of itemEffects(item, level, bonus)) totals[effect] += effectStrength(effect, item.stars) * share * perkShare(effect, level);
  }
  return totals;
}

/**
 * Shortcut: the combined effects of everything a member has equipped. Someone else's exclusive
 * item counts at equipment.borrowed.effectiveness. `userId` is the member the gear belongs to.
 */
export function gearEffects(equipment: GearIds | null | undefined, userId: string): EffectTotals {
  return totalEffects(equippedGear(equipment), userId);
}

/**
 * The gear-card text for one perk at this strength: the perk's own `line` when it has one (like
 * STONKS!'s hour-by-hour curve), otherwise its plain text at the formatted strength ("+10% ...").
 */
function effectLine(effect: EffectId, strength: number): string {
  const perk: PerkDef = EFFECTS[effect];
  return perk.line ? perk.line(strength, CONFIG) : perk.text(formatPercent(strength));
}

/**
 * One readable line per effect on an item, like "+10% rob success chance", at a refinement level
 * (fully refined unless given), then its bonus: on once the copy is a `masterwork`, or dormant (with
 * what one costs) on an R5 copy that isn't (hidden below that level). `share` scales the
 * strengths further, for an item worn at less than full effect (see itemEffectiveness).
 */
export function describeEffects(item: ItemDef, share = 1, level: number = REFINE.maxLevel, masterwork = true): string[] {
  const lines = itemEffects(item, level, masterwork).map((effect) => effectLine(effect, effectStrength(effect, item.stars) * share * perkShare(effect, level)));
  const state = bonusState(item, level, masterwork);
  if (item.bonus && state === 'masterwork') lines.push(TEXT.gear.bonus(item.bonus.text));
  if (item.bonus && state === 'dormant') lines.push(TEXT.gear.bonusDormant(item.bonus.text, CONFIG.refine.masterworkGems));
  return lines;
}

/** One readable line per effect that is active in the totals, in the registry's order. */
export function describeTotals(totals: EffectTotals): string[] {
  return EFFECT_IDS.filter((effect) => totals[effect] > 0).map((effect) => effectLine(effect, totals[effect]));
}
