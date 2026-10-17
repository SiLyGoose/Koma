import type { RaidClassId } from '../constants/raid.js';
import type { ItemDef, TmArmorDef } from '../types.js';

/*
 * TechnoMagic gear's main stat in the TechnoMagic Raid: King's Raid's own for its TechnoMagic gear at 5★ (the game's
 * tables, datamined at github.com/faberuser/kingsraid-table-data: EquipItemTable's base stats of Galgoria's Perseverance
 * pieces, times EquipUpgradeStatTable's 5★ factor for them, 6 for HP and 8 for DEF). TechnoMagic gear is never refined,
 * so its main stat is always its 5★ one. A weapon's is HP, King's Raid's TechnoMagic ring's (the same for every class).
 * An armor's is P.DEF or M.DEF (ItemCopyDoc.tmArmorDef, rolled as it drops: King's Raid's TechnoMagic Armor, or its
 * Secondary Gear), by how heavy its class's armor is. A treasure has none. It is added to its hero's stat as it is,
 * before any share more of it (lib/game/heroes.ts), and only on a hero of its class, as the rest of the piece.
 */

/** A TechnoMagic weapon's HP. */
export const TM_WEAPON_HP = 1_634_124;

/** A TechnoMagic armor's P.DEF and M.DEF (whichever its copy has), by its class: heavy armor, medium armor and light armor's. */
export const TM_ARMOR_DEF: Readonly<Record<RaidClassId, Readonly<Record<TmArmorDef, number>>>> = {
  knight: { physical: 51_160, magical: 51_160 },
  warrior: { physical: 51_160, magical: 51_160 },
  archer: { physical: 34_104, magical: 17_056 },
  assassin: { physical: 34_104, magical: 17_056 },
  mechanic: { physical: 34_104, magical: 17_056 },
  wizard: { physical: 17_056, magical: 34_104 },
  priest: { physical: 17_056, magical: 34_104 },
};

/** The two DEFs an armor's main stat can be, each as likely as it drops. */
export const TM_ARMOR_DEFS: readonly TmArmorDef[] = ['physical', 'magical'];

/** A main stat: the hero's stat it raises (lib/game/heroes.ts HeroStat), its name as King's Raid says it, and how much. */
export interface TmMainStat {
  stat: 'hpFlat' | 'defPhysicalFlat' | 'defMagicalFlat';
  name: string;
  value: number;
}

const DEF_STAT = { physical: 'defPhysicalFlat', magical: 'defMagicalFlat' } as const;
const DEF_NAME = { physical: 'P. DEF', magical: 'M. DEF' } as const;

/**
 * A piece's main stat: a TechnoMagic weapon's HP, or a TechnoMagic armor's DEF of kind `def` (its copy's) for its class.
 * Null for anything else, and for an armor with no DEF given (a copy that has none yet).
 */
export function tmMainStat(item: Pick<ItemDef, 'tmDrop' | 'slot' | 'class'>, def?: TmArmorDef): TmMainStat | null {
  if (!item.tmDrop) return null;
  if (item.slot === 'weapon') return { stat: 'hpFlat', name: 'HP', value: TM_WEAPON_HP };
  if (item.slot !== 'armor' || !def || !item.class) return null;
  return { stat: DEF_STAT[def], name: DEF_NAME[def], value: TM_ARMOR_DEF[item.class][def] };
}

/** Every main stat a TechnoMagic piece's copy can have (the databank's): a weapon's one, an armor's two (P.DEF first), a treasure's none. */
export const tmMainStats = (item: Pick<ItemDef, 'tmDrop' | 'slot' | 'class'>): TmMainStat[] =>
  item.slot === 'armor' ? TM_ARMOR_DEFS.flatMap((def) => tmMainStat(item, def) ?? []) : [tmMainStat(item)].filter((one): one is TmMainStat => one !== null);
