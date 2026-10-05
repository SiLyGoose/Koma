import { normalize } from '../../lib/text.js';
import type { ItemDef, Stars } from '../../types.js';
import { ITEMS } from './catalog.js';

export const ITEMS_BY_ID: ReadonlyMap<string, ItemDef> = new Map(
  ITEMS.map((item): [string, ItemDef] => [item.id, item]),
);

export function itemsByStars(stars: Stars): ItemDef[] {
  return ITEMS.filter((item) => item.stars === stars);
}

/** The items of a star tier the gacha can pull: all of them but the raid drops. */
export function gachaItems(stars: Stars): ItemDef[] {
  return itemsByStars(stars).filter((item) => !item.raidDrop);
}

/** The items that only drop from raid bosses (ItemDef.raidDrop). */
export const RAID_DROPS: readonly ItemDef[] = ITEMS.filter((item) => item.raidDrop);

export type ItemLookup = { kind: 'found'; item: ItemDef } | { kind: 'ambiguous'; matches: ItemDef[] } | { kind: 'none' };

/**
 * Finds an item by its name or id, ignoring case and punctuation. An exact match wins;
 * otherwise a partial name works as long as it points to exactly one item.
 */
export function findItem(query: string, pool: readonly ItemDef[] = ITEMS): ItemLookup {
  const wanted = normalize(query);
  if (wanted === '') return { kind: 'none' };

  const exact = pool.find((item) => normalize(item.name) === wanted || normalize(item.id) === wanted);
  if (exact) return { kind: 'found', item: exact };

  const partial = pool.filter((item) => normalize(item.name).includes(wanted));
  if (partial.length === 1) return { kind: 'found', item: partial[0] as ItemDef };
  if (partial.length > 1) return { kind: 'ambiguous', matches: partial };
  return { kind: 'none' };
}
