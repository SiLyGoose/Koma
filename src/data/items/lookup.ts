import { ITEM_SUGGEST } from '../../constants/index.js';
import { editDistance, normalize } from '../../lib/text.js';
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

/** How many typos a name `letters` long can have and still be guessed (ITEM_SUGGEST.typos). */
function typosAllowed(letters: number): number {
  return ITEM_SUGGEST.typos.find(([atLeast]) => letters >= atLeast)?.[1] ?? 0;
}

/**
 * How many typos `wanted` (normalized, spaces dropped) is from an item: from its whole name or id,
 * or from any run of words in its name, so "stwrfall" is one typo from "Starfall Blade" and
 * "dragon scale" none from "Dragonscale Aegis". Spaces don't count, so a missing or extra one is no typo.
 */
function typosFrom(wanted: string, item: ItemDef): number {
  const words = normalize(item.name).split(' ');
  let best = editDistance(wanted, normalize(item.id).replace(/ /g, ''));
  for (let start = 0; start < words.length; start++) {
    for (let end = start + 1; end <= words.length; end++) {
      best = Math.min(best, editDistance(wanted, words.slice(start, end).join('')));
    }
  }
  return best;
}

/**
 * The items `query` most likely meant when findItem found none: the ones the fewest typos away,
 * as long as that is few enough for how much was typed (ITEM_SUGGEST.typos). Several only when
 * they tie, at most ITEM_SUGGEST.maxChoices, the closest whole names first. None if nothing is close.
 */
export function suggestItems(query: string, pool: readonly ItemDef[] = ITEMS): ItemDef[] {
  const wanted = normalize(query).replace(/ /g, '');
  const allowed = typosAllowed(wanted.length);
  if (allowed === 0) return [];

  const scored = pool.map((item) => ({ item, typos: typosFrom(wanted, item) })).filter((entry) => entry.typos <= allowed);
  const fewest = Math.min(...scored.map((entry) => entry.typos));
  const wholeName = (item: ItemDef) => editDistance(wanted, normalize(item.name).replace(/ /g, ''));
  return scored
    .filter((entry) => entry.typos === fewest)
    .map((entry) => entry.item)
    .sort((a, b) => wholeName(a) - wholeName(b))
    .slice(0, ITEM_SUGGEST.maxChoices);
}
