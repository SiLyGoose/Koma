import { CONFIG } from '../../config.js';
import { ADMIN_USER_ID } from '../../constants/index.js';
import { EFFECT_IDS, EFFECTS, emptyTotals, type EffectId, type EffectTotals, type PerkDef } from '../../perks/index.js';
import { ITEMS_BY_ID } from '../../data/items.js';
import { SLOTS, type GearIds, type ItemDef, type Stars } from '../../types.js';
import { formatPercent } from '../format.js';
import { refineShare } from './refine.js';
import { REFINE } from '../../constants/index.js';

/** How strong an effect is on an item of the given star tier, from the live settings. */
export function effectStrength(effect: EffectId, stars: Stars): number {
  return CONFIG.equipment[effect][stars];
}

/** One equipped item and the refinement level of the copy worn. */
export interface GearPiece {
  item: ItemDef;
  level: number;
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
    if (item && item.slot === slot) pieces.push({ item, level: equipment?.levels?.[slot] ?? REFINE.maxLevel });
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
 * (refineShare); a bare item counts as fully refined. With `userId`, each also counts at the share
 * of its effects that member gets (itemEffectiveness); without it, in full.
 */
export function totalEffects(gear: readonly (ItemDef | GearPiece)[], userId?: string): EffectTotals {
  const totals = emptyTotals();
  for (const piece of gear) {
    const { item, level } = 'item' in piece ? piece : { item: piece, level: REFINE.maxLevel };
    const share = (userId === undefined ? 1 : itemEffectiveness(item, userId)) * refineShare(level);
    for (const effect of item.effects) totals[effect] += effectStrength(effect, item.stars) * share;
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
 * (fully refined unless given). `share` scales the strengths further, for an item worn at less
 * than full effect (see itemEffectiveness).
 */
export function describeEffects(item: ItemDef, share = 1, level: number = REFINE.maxLevel): string[] {
  return item.effects.map((effect) => effectLine(effect, effectStrength(effect, item.stars) * share * refineShare(level)));
}

/** One readable line per effect that is active in the totals, in the registry's order. */
export function describeTotals(totals: EffectTotals): string[] {
  return EFFECT_IDS.filter((effect) => totals[effect] > 0).map((effect) => effectLine(effect, totals[effect]));
}
