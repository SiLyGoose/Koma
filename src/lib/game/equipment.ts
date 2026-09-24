import { CONFIG } from '../../config.js';
import { ADMIN_USER_ID } from '../../constants.js';
import { EFFECT_IDS, EFFECTS, emptyTotals, type EffectId, type EffectTotals, type PerkDef } from '../../perks/index.js';
import { ITEMS_BY_ID } from '../../data/items.js';
import { SLOTS, type GearIds, type ItemDef, type Stars } from '../../types.js';
import { formatPercent } from '../format.js';

/** How strong an effect is on an item of the given star tier, from the live settings. */
export function effectStrength(effect: EffectId, stars: Stars): number {
  return CONFIG.equipment[effect][stars];
}

/**
 * The catalog items a member has equipped. Ids that are no longer in the catalog, or that sit
 * in the wrong slot (say the catalog changed), are ignored rather than trusted.
 */
export function equippedItems(equipment: GearIds | null | undefined): ItemDef[] {
  const items: ItemDef[] = [];
  for (const slot of SLOTS) {
    const id = equipment?.[slot];
    if (!id) continue;
    const item = ITEMS_BY_ID.get(id);
    if (item && item.slot === slot) items.push(item);
  }
  return items;
}

/**
 * Whether `userId` gets this item's effects. Items with no `usableBy` list work for everyone;
 * otherwise only the listed users, plus the admin (who can use everything, to test with).
 */
export function canUseItem(item: ItemDef, userId: string): boolean {
  if (!item.usableBy) return true;
  return userId === ADMIN_USER_ID || item.usableBy.includes(userId);
}

/** The items `userId` actually gets effects from. */
export function usableItems(items: readonly ItemDef[], userId: string): ItemDef[] {
  return items.filter((item) => canUseItem(item, userId));
}

/** Adds up every effect across the given items. */
export function totalEffects(items: readonly ItemDef[]): EffectTotals {
  const totals = emptyTotals();
  for (const item of items) {
    for (const effect of item.effects) totals[effect] += effectStrength(effect, item.stars);
  }
  return totals;
}

/**
 * Shortcut: the combined effects of everything a member has equipped. Exclusive items they may
 * not use are equipped but add nothing. `userId` is the member the gear belongs to.
 */
export function gearEffects(equipment: GearIds | null | undefined, userId: string): EffectTotals {
  return totalEffects(usableItems(equippedItems(equipment), userId));
}

/**
 * The gear-card text for one perk at this strength: the perk's own `line` when it has one (like
 * STONKS!'s hour-by-hour curve), otherwise its plain text at the formatted strength ("+10% ...").
 */
function effectLine(effect: EffectId, strength: number): string {
  const perk: PerkDef = EFFECTS[effect];
  return perk.line ? perk.line(strength, CONFIG) : perk.text(formatPercent(strength));
}

/** One readable line per effect on an item, like "+10% rob success chance". */
export function describeEffects(item: ItemDef): string[] {
  return item.effects.map((effect) => effectLine(effect, effectStrength(effect, item.stars)));
}

/** One readable line per effect that is active in the totals, in the registry's order. */
export function describeTotals(totals: EffectTotals): string[] {
  return EFFECT_IDS.filter((effect) => totals[effect] > 0).map((effect) => effectLine(effect, totals[effect]));
}
