import { CONFIG } from '../config.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { poolOption, rollKrOptions, type KrRng } from '../data/kr-gear.js';
import { HERO_SLOTS, type HeroDoc, type HeroSlot, type ItemCopyDoc, type KrOption, type TmPotential } from '../types.js';

/*
 * The move from the TechnoMagic Raid's own hero gear to King's Raid's (data/kr-gear.ts), as pure steps (scripts/migrate-kr-gear.ts
 * runs them on the database: on a copy of it first). Nobody loses what they have:
 *
 *   - a TechnoMagic weapon (its main stat HP) becomes its class's Perseverance Orb; a TechnoMagic armor its Armor (its main
 *     stat P.DEF) or Mantle (M.DEF); a TechnoMagic treasure its Earrings (an Accessory). Each at R5, as their main
 *     stats were King's Raid's at 5★; their additional skill kept as their unique option; their potentials become their two
 *     options (those of the pool's stats, the best first, each at the step nearest its share of its old range), the rest rolled;
 *   - a hero's old slots become King's Raid's: its first weapon (a unique weapon) its Weapon, a TechnoMagic weapon its Orb, its
 *     armors its Armor and Mantle (by what each became), its treasure its Treasure (a TechnoMagic one its Accessory),
 *     its subs as they were. What no longer goes on a hero (the members' own gear), and a second piece for a slot already
 *     filled, comes off: it stays the member's, unchanged.
 */

/** The TechnoMagic Raid's old pieces' ids, by what each becomes for a class (`armorDef` saying which, for an armor). */
export function migratedItemId(itemId: string, armorDef?: 'physical' | 'magical'): string | null {
  const item = ITEMS_BY_ID.get(itemId);
  if (!item?.tmDrop || !item.class) return null;
  const set = item.tmSet ?? 'perseverance';
  if (item.slot === 'weapon') return `${set}-${item.class}-orb`;
  if (item.slot === 'armor') return `${set}-${item.class}-${armorDef === 'magical' ? 'secondary' : 'armor'}`;
  return `${set}-${item.class}-earrings`;
}

/** An old potential's stat, as King's Raid's TechnoMagic options name it (null: none of theirs is like it). */
const OPTION_OF: Readonly<Record<string, string>> = {
  atk: 'atk',
  speed: 'speed',
  hp: 'hp',
  defense: 'defPhysical',
  defPhysical: 'defPhysical',
  defMagical: 'defMagical',
  block: 'blockPhysical',
  blockPhysical: 'blockPhysical',
  blockMagical: 'blockMagical',
  dodge: 'dodgePhysical',
  accuracy: 'accuracy',
  resist: 'resist',
  crit: 'crit',
  critDamage: 'critDamage',
  manaAttack: 'manaAttack',
  manaRegen: 'manaRegen',
  lifesteal: 'lifesteal',
  critResist: 'critResistPhysical',
  pen: 'pen',
};

/** How far along its range (0 to 1) an old potential rolled. */
function along({ stat, value }: TmPotential): number {
  const range = CONFIG.hero.potentials[stat];
  if (!range || range.max <= range.min) return 1;
  return Math.min(1, Math.max(0, (value - range.min) / (range.max - range.min)));
}

/** A piece's options from its old potentials: those its pool has, the best first, each at its step; the rest rolled. */
export function migratedOptions(newItemId: string, potentials: readonly TmPotential[] | undefined, rng?: KrRng): KrOption[] {
  const kr = ITEMS_BY_ID.get(newItemId)?.kr;
  if (!kr) return [];
  const out: KrOption[] = [];
  for (const potential of [...(potentials ?? [])].sort((a, b) => along(b) - along(a))) {
    const stat = OPTION_OF[potential.stat];
    const option = stat ? poolOption(kr.pool, stat) : undefined;
    if (!stat || !option || out.some((one) => one.stat === stat)) continue;
    out.push({ stat, step: Math.round(along(potential) * option.steps) });
    if (out.length >= kr.options) return out;
  }
  // (The rest rolled, as a new copy's are: any stat, one it has already too.)
  return [...out, ...rollKrOptions(kr, rng).slice(0, kr.options - out.length)];
}

/** What a copy becomes (null: it isn't old TechnoMagic gear, and stays as it is). */
export function migratedCopy(copy: Pick<ItemCopyDoc, 'itemId' | 'tmPotentials' | 'tmArmorDef'>, rng?: KrRng): { itemId: string; level: number; options: KrOption[] } | null {
  const itemId = migratedItemId(copy.itemId, copy.tmArmorDef);
  if (!itemId || !ITEMS_BY_ID.has(itemId)) return null;
  return { itemId, level: 5, options: migratedOptions(itemId, copy.tmPotentials, rng) };
}

/** The old hero slots (before King's Raid's), as they were stored. */
const OLD_SLOTS = ['weapon1', 'weapon2', 'armor1', 'armor2', 'treasure', 'side1', 'side2', 'side3'] as const;

/**
 * A hero's equipment in King's Raid's slots, from its old one: each copy (`itemOf`: the item it is now, after its own move;
 * undefined: not theirs any more) put in the slot of its part, the first for each; a unique treasure's subs as they were.
 */
export function migratedEquipment(old: Record<string, string | null | undefined> | undefined, itemOf: (copyId: string) => string | undefined): Partial<Record<HeroSlot, string | null>> {
  const out: Partial<Record<HeroSlot, string | null>> = {};
  for (const slot of OLD_SLOTS) {
    const copyId = old?.[slot];
    if (typeof copyId !== 'string' || copyId === '') continue;
    const item = ITEMS_BY_ID.get(itemOf(copyId) ?? '');
    if (!item) continue;
    let to: HeroSlot | null = null;
    if (item.uniqueWeapon !== undefined) to = 'weapon';
    else if (item.uniqueTreasure !== undefined) to = slot.startsWith('side') ? (slot as HeroSlot) : 'treasure';
    else if (item.kr) to = item.kr.part === 'treasure' ? null : (item.kr.part as HeroSlot);
    if (to && !out[to]) out[to] = copyId;
  }
  // (Already in King's Raid's own slots: kept as it is.)
  for (const slot of HERO_SLOTS.filter((one) => !(OLD_SLOTS as readonly string[]).includes(one))) {
    const copyId = old?.[slot];
    if (typeof copyId === 'string' && copyId !== '' && !out[slot]) out[slot] = copyId;
  }
  return out;
}

/** Whether a hero's equipment is still in the old slots. */
export const oldEquipment = (hero: Pick<HeroDoc, 'equipment'> | undefined): boolean => OLD_SLOTS.some((slot) => slot !== 'treasure' && !slot.startsWith('side') && (hero?.equipment as Record<string, unknown> | undefined)?.[slot] != null);
