import { EFFECTS } from './effects.js';
import { SLOTS, STARS } from '../types.js';
import type { ItemDef, Stars } from '../types.js';

/**
 * The item catalog. Add, rename or remove items here; ids must be unique and never change
 * once players own the item (inventories store the id). Items in the same star tier are
 * equally likely to be pulled.
 *
 * Every item goes in one slot (weapon or armor) and lists the effects it gives while
 * equipped. Effect strength depends on the star tier and lives in the settings
 * (equipment.<effect>.<stars>), so a 3-star item is always stronger than a 1-star one that
 * lists the same effect. Weapons lean toward offense and armor toward defense, plus a perk.
 */
export const ITEMS: readonly ItemDef[] = [
  // 1 star
  {
    id: 'rusty-dagger',
    name: 'Rusty Dagger',
    stars: 1,
    slot: 'weapon',
    description: 'Pitted with age, but it still holds an edge.',
    effects: ['robChance'],
  },
  {
    id: 'wooden-shield',
    name: 'Wooden Shield',
    stars: 1,
    slot: 'armor',
    description: 'Splintered at the rim and smelling of old pine.',
    effects: ['robDefense'],
  },

  // 2 stars
  {
    id: 'iron-longsword',
    name: 'Iron Longsword',
    stars: 2,
    slot: 'weapon',
    description: "A soldier's blade, honest and well balanced.",
    effects: ['robChance', 'robAmount'],
  },
  {
    id: 'merchants-coat',
    name: "Merchant's Coat",
    stars: 2,
    slot: 'armor',
    description: 'Pockets everywhere, every one of them lined with silk.',
    effects: ['robDefense', 'claimBonus'],
  },

  // 3 stars
  {
    id: 'starfall-blade',
    name: 'Starfall Blade',
    stars: 3,
    slot: 'weapon',
    description: 'Hammered from a meteor. When it moves, the guards look the other way.',
    effects: ['robChance', 'robAmount', 'fineReduction'],
  },
  {
    id: 'dragonscale-aegis',
    name: 'Dragonscale Aegis',
    stars: 3,
    slot: 'armor',
    description: 'A shield grown, not forged. Dragons never pay full price, and neither does its bearer.',
    effects: ['robDefense', 'robShield', 'pullDiscount'],
  },

  // 4 stars
  {
    // Alvin
    id: 'c4',
    name: 'C4',
    stars: 4,
    slot: 'weapon',
    description: 'Explosions? I love explosions.',
    effects: ['robChance', 'robAmount', 'fineReduction'], // rob effectiveness and punishments will be boosted
  },
  {
    // Helen
    id: 'jew-frog',
    name: 'Jew Frog',
    stars: 4,
    slot: 'weapon',
    description: 'A frog. It is a frog.',
    effects: ['robChance', 'robAmount'], // user robbed will have next rob taxed
  },
  {
    // JJ
    id: 'mustache',
    name: 'Mustache',
    stars: 4,
    slot: 'armor',
    description: 'A mustache. It is a mustache.',
    effects: ['robDefense', 'robShield', 'pullDiscount'],
  },
  {
    // Aaron
    id: 'wheelchair',
    name: 'Wheelchair',
    stars: 4,
    slot: 'armor',
    description: 'A wheelchair. It is a wheelchair.',
    effects: ['robDefense', 'robShield', 'pullDiscount'],
  },
  {
    // Gene
    id: 'coughing-baby',
    name: 'Coughing Baby',
    stars: 4,
    slot: 'weapon',
    description: 'A baby. It is a baby.',
    effects: ['robDefense', 'robShield', 'pullDiscount'], // user robbed will have next claim taxed
  }
];

export const ITEMS_BY_ID: ReadonlyMap<string, ItemDef> = new Map(
  ITEMS.map((item): [string, ItemDef] => [item.id, item]),
);

export function itemsByStars(stars: Stars): ItemDef[] {
  return ITEMS.filter((item) => item.stars === stars);
}

/** Lowercase and drop punctuation so "merchants coat" finds "Merchant's Coat". */
function normalize(text: string): string {
  return text.toLowerCase().replace(/['’`".,!?-]/g, ' ').replace(/\s+/g, ' ').trim();
}

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
