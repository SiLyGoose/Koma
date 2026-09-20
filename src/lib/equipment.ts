import { CONFIG } from '../config.js';
import { EFFECT_TEXT } from '../constants.js';
import { EFFECT_IDS, emptyTotals, type EffectId, type EffectTotals } from '../data/effects.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { SLOTS, type EquipmentDoc, type ItemDef, type Stars } from '../types.js';
import { formatPercent } from './format.js';

/** How strong an effect is on an item of the given star tier, from the live settings. */
export function effectStrength(effect: EffectId, stars: Stars): number {
  return CONFIG.equipment[effect][stars];
}

/**
 * The catalog items a member has equipped. Ids that are no longer in the catalog, or that sit
 * in the wrong slot (say the catalog changed), are ignored rather than trusted.
 */
export function equippedItems(equipment: EquipmentDoc | null | undefined): ItemDef[] {
  const items: ItemDef[] = [];
  for (const slot of SLOTS) {
    const id = equipment?.[slot];
    if (!id) continue;
    const item = ITEMS_BY_ID.get(id);
    if (item && item.slot === slot) items.push(item);
  }
  return items;
}

/** Adds up every effect across the given items. */
export function totalEffects(items: readonly ItemDef[]): EffectTotals {
  const totals = emptyTotals();
  for (const item of items) {
    for (const effect of item.effects) totals[effect] += effectStrength(effect, item.stars);
  }
  return totals;
}

/** Shortcut: the combined effects of everything a member has equipped. */
export function gearEffects(equipment: EquipmentDoc | null | undefined): EffectTotals {
  return totalEffects(equippedItems(equipment));
}

/** One readable line per effect on an item, like "+10% rob success chance". */
export function describeEffects(item: ItemDef): string[] {
  return item.effects.map((effect) => EFFECT_TEXT[effect](formatPercent(effectStrength(effect, item.stars))));
}

/** One readable line per effect that is active in the totals, in the registry's order. */
export function describeTotals(totals: EffectTotals): string[] {
  return EFFECT_IDS.filter((effect) => totals[effect] > 0).map((effect) =>
    EFFECT_TEXT[effect](formatPercent(totals[effect])),
  );
}
