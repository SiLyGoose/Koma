import { randomInt } from 'node:crypto';
import { RAID_DROPS } from '../../../data/items.js';
import type { ItemDef } from '../../../types.js';
import { chance as rollChance } from '../../random.js';

/*
 * Raid drops: the items that can't be pulled from the gacha (ItemDef.raidDrop). When a raid boss is
 * beaten, each raider who took part rolls raid.dropChance once, and on a hit gets one of them, every
 * raid drop as likely as the others. The database side is in services/raid.ts (rewardRaid).
 */

export interface RaidDrop {
  userId: string;
  item: ItemDef;
}

/** The random numbers a drop roll uses; only tests replace them. */
export interface DropRng {
  /** True with this probability. */
  chance: (probability: number) => boolean;
  /** A whole number from 0 up to (not including) `max`. */
  index: (max: number) => number;
}

const defaultRng: DropRng = { chance: rollChance, index: (max) => randomInt(0, max) };

/** Who finds an item, and which one, in the order they were given. Nobody does with no raid drops in the catalog. */
export function rollRaidDrops(userIds: readonly string[], dropChance: number, rng: DropRng = defaultRng, pool: readonly ItemDef[] = RAID_DROPS): RaidDrop[] {
  if (pool.length === 0 || !(dropChance > 0)) return [];
  const drops: RaidDrop[] = [];
  for (const userId of userIds) {
    if (rng.chance(dropChance)) drops.push({ userId, item: pool[rng.index(pool.length)] as ItemDef });
  }
  return drops;
}
