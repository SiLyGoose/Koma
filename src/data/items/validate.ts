import { normalize } from '../../lib/text.js';
import { EFFECTS } from '../../perks/index.js';
import { SLOTS, STARS } from '../../types.js';
import { ITEMS } from './catalog.js';
import { itemsByStars } from './lookup.js';

/** Throws at startup if the catalog would break the gacha or the equipment system. */
export function validateItems(): void {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const item of ITEMS) {
    if (ids.has(item.id)) throw new Error(`Duplicate item id in catalog: ${item.id}`);
    ids.add(item.id);

    const name = normalize(item.name);
    if (names.has(name)) throw new Error(`Two items share the name "${item.name}", so it could not be equipped by name.`);
    names.add(name);

    if (!SLOTS.includes(item.slot)) throw new Error(`${item.id} has an unknown slot: ${item.slot}`);
    if (item.usableBy !== undefined) {
      if (item.usableBy.length === 0) throw new Error(`${item.id} has an empty usableBy list, so nobody could use it. Remove it or add ids.`);
      for (const userId of item.usableBy) {
        if (!/^\d{17,20}$/.test(userId)) throw new Error(`${item.id} has a usableBy entry that is not a Discord user id: "${userId}"`);
      }
    }
    for (const effect of item.effects) {
      if (!(effect in EFFECTS)) throw new Error(`${item.id} has an unknown effect: ${effect}`);
    }
  }
  for (const stars of STARS) {
    if (itemsByStars(stars).length === 0) {
      throw new Error(`The ${stars}-star tier has no items, so it could never be rolled.`);
    }
  }
}
