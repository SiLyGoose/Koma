import { randomInt } from 'node:crypto';
import type { Settings } from '../../../config.js';
import { RAID_DROPS } from '../../../data/items.js';
import type { ItemDef } from '../../../types.js';
import { chance as rollChance } from '../../random.js';

/*
 * Raid drops: the items that can't be pulled from the gacha (ItemDef.raidDrop). When a raid boss is
 * beaten, the party rolls once: raid.dropChance, plus raid.dropChancePerRaider for each raider who
 * took part (up to 100%). On a hit every one of them gets one, each picked at random, every raid drop
 * as likely as the others. The database side is in services/raid.ts (rewardRaid).
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

type DropSettings = Pick<Settings['raid'], 'dropChance' | 'dropChancePerRaider'>;

const defaultRng: DropRng = { chance: rollChance, index: (max) => randomInt(0, max) };

/** The chance (0 to 1) a party of `raiders` gets raid drops when they beat the boss. */
export function raidDropChance(raiders: number, cfg: DropSettings): number {
  return Math.min(1, Math.max(0, cfg.dropChance + cfg.dropChancePerRaider * Math.max(0, raiders)));
}

/** Whether raid drops are on at all (some party size has a chance at them). */
export const raidDropsOn = (cfg: DropSettings): boolean => cfg.dropChance > 0 || cfg.dropChancePerRaider > 0;

/**
 * Who finds an item, and which one, in the order they were given: the party rolls `partyChance` once
 * (see raidDropChance), and on a hit everyone finds one. Nobody does with no raid drops in the catalog.
 */
export function rollRaidDrops(userIds: readonly string[], partyChance: number, rng: DropRng = defaultRng, pool: readonly ItemDef[] = RAID_DROPS): RaidDrop[] {
  if (pool.length === 0 || userIds.length === 0 || !(partyChance > 0) || !rng.chance(partyChance)) return [];
  return userIds.map((userId) => ({ userId, item: pool[rng.index(pool.length)] as ItemDef }));
}
