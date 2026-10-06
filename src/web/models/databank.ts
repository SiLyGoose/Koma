import { CONFIG } from '../../config.js';
import { REFINE } from '../../constants/index.js';
import { ITEMS } from '../../data/items.js';
import { describeEffects } from '../../lib/game/items/equipment.js';
import type { ItemDef, Slot, Stars } from '../../types.js';

/*
 * The site's databank page (GET /api/databank): every item in the catalog and what it does at each
 * refinement level and where it comes from, like the `databank` command. It's the same for everyone,
 * so it needs no login.
 * Effect lines are the gear card's, as Discord shows them (the page draws the emoji and *italics*).
 */

export interface DatabankItem {
  id: string;
  name: string;
  stars: Stars;
  slot: Slot;
  description: string;
  /** What it does at each refinement level: `effects[0]` is R1, the last is REFINE.maxLevel. */
  effects: string[][];
  /** What it does as a masterwork at REFINE.maxLevel (its bonus on), or null when it has no bonus. */
  masterwork: string[] | null;
  /** Made for certain members: the share of its effects anyone else gets (null when anyone can use it). */
  borrowed: number | null;
  /** Where it comes from: pulled from the gacha, or only dropped by raid bosses (ItemDef.raidDrop). */
  source: ItemSource;
}

export type ItemSource = 'gacha' | 'raid';

/** GET /api/databank. */
export interface Databank {
  maxLevel: number;
  /**
   * The chance (0 to 1) a party that beats a raid boss gets raid drops, each of them finding one
   * (raid.dropChance), before what each raider adds to it (raid.dropChancePerRaider). Both 0 when drops are off.
   */
  raidDropChance: number;
  raidDropChancePerRaider: number;
  /** Highest tier first, then in catalog order. */
  items: DatabankItem[];
}

export function databankView(items: readonly ItemDef[] = ITEMS): Databank {
  const levels = Array.from({ length: REFINE.maxLevel }, (_, i) => i + 1);
  const list = items.map(
    (item): DatabankItem => ({
      id: item.id,
      name: item.name,
      stars: item.stars,
      slot: item.slot,
      description: item.description,
      effects: levels.map((level) => describeEffects(item, 1, level, false)),
      masterwork: item.bonus ? describeEffects(item, 1, REFINE.maxLevel, true) : null,
      borrowed: item.usableBy ? CONFIG.equipment.borrowed.effectiveness : null,
      source: item.raidDrop ? 'raid' : 'gacha',
    }),
  );
  // A stable sort: within a tier, the catalog's own order.
  list.sort((a, b) => b.stars - a.stars);
  return { maxLevel: REFINE.maxLevel, raidDropChance: CONFIG.raid.dropChance, raidDropChancePerRaider: CONFIG.raid.dropChancePerRaider, items: list };
}
