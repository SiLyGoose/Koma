import { CONFIG } from '../../config.js';
import { ADMIN_USER_ID, EFFECT_TEXT } from '../../constants.js';
import { EFFECT_IDS, emptyTotals, type EffectId, type EffectTotals } from '../../data/effects.js';
import { ITEMS_BY_ID } from '../../data/items.js';
import { SLOTS, type GearIds, type ItemDef, type Stars } from '../../types.js';
import { formatMultiplier, formatPercent } from '../format.js';
import { stonksCurvePoints } from './perks.js';

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
 * STONKS!'s own line, in the multiplier form a player actually sees (not the raw "added percent"
 * strength every other effect's text is built from): at most 5 hour marks along its curve, read
 * live off `CONFIG.stonks.capHours` so the line always matches what the effect really does.
 */
function stackosaurusLine(strength: number): string {
  const points = stonksCurvePoints(strength, CONFIG.stonks.capHours);
  if (points.length === 0) return EFFECT_TEXT.stackosaurus(formatPercent(strength));
  const parts = points.map(({ hours, multiplier }) => `${formatMultiplier(multiplier)} at ${Number(hours.toFixed(1))}h`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] as string);
  return `Stackosaurus: your claim multiplier starts at 1x once your claim is ready and climbs the longer you wait after that, reaching ${list} (the cap).`;
}

/** The gear-card text for one effect at this strength: STONKS!'s own hour-by-hour line, or the registry's plain "+N%" text. */
function effectLine(effect: EffectId, strength: number): string {
  return effect === 'stackosaurus' ? stackosaurusLine(strength) : EFFECT_TEXT[effect](formatPercent(strength));
}

/** One readable line per effect on an item, like "+10% rob success chance". */
export function describeEffects(item: ItemDef): string[] {
  return item.effects.map((effect) => effectLine(effect, effectStrength(effect, item.stars)));
}

/** One readable line per effect that is active in the totals, in the registry's order. */
export function describeTotals(totals: EffectTotals): string[] {
  return EFFECT_IDS.filter((effect) => totals[effect] > 0).map((effect) => effectLine(effect, totals[effect]));
}
