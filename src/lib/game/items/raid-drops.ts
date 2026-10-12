import { randomInt } from 'node:crypto';
import type { Settings } from '../../../config.js';
import { RAID_DIFFICULTY } from '../../../constants/index.js';
import { RAID_DROPS } from '../../../data/items.js';
import type { ItemDef, Stars } from '../../../types.js';
import { chance as rollChance } from '../../random.js';

/*
 * Raid drops: the items that can't be pulled from the gacha (ItemDef.raidDrop). When a raid boss is
 * beaten, the party rolls once: raid.dropChance, plus raid.dropChancePerRaider for each raider who
 * took part (up to 100%). On a hit every one of them gets what the raid's difficulty drops
 * (raidDropCounts: one top-tier item at level 1, more the harder it was), each picked at random, every
 * raid drop of its tier as likely as the others. The database side is in services/raid.ts (rewardRaid).
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

/** How many raid items of each tier a raider finds on a hit (tiers left out give none). */
export type DropCounts = Partial<Record<Stars, number>>;

const defaultRng: DropRng = { chance: rollChance, index: (max) => randomInt(0, max) };

/** The chance (0 to 1) a party of `raiders` gets raid drops when they beat the boss. */
export function raidDropChance(raiders: number, cfg: DropSettings): number {
  return Math.min(1, Math.max(0, cfg.dropChance + cfg.dropChancePerRaider * Math.max(0, raiders)));
}

/** Whether raid drops are on at all (some party size has a chance at them). */
export const raidDropsOn = (cfg: DropSettings): boolean => cfg.dropChance > 0 || cfg.dropChancePerRaider > 0;

/**
 * What a raid at `difficulty` drops for each raider (RAID_DIFFICULTY): one top-tier item, one more at
 * every milestone level (5 and 10), and one of the tier below for every level in between, which add
 * up. So level 1 is one 4-star; level 4, one 4-star and three 3-stars; level 5, two 4-stars and those
 * three 3-stars; level 10, three 4-stars and seven 3-stars.
 */
export function raidDropCounts(difficulty: number): DropCounts {
  const level = Math.min(RAID_DIFFICULTY.max, Math.max(1, Math.floor(difficulty)));
  const milestones = Math.floor(level / RAID_DIFFICULTY.milestoneEvery);
  return { [RAID_DIFFICULTY.milestoneStars]: 1 + milestones, [RAID_DIFFICULTY.stepStars]: level - 1 - milestones };
}

/**
 * Who finds which items, in the order they were given (each raider's best items first): the party
 * rolls `partyChance` once (see raidDropChance), and on a hit everyone finds `counts` of each tier.
 * A tier with no raid drops in the catalog gives nothing.
 */
export function rollRaidDrops(
  userIds: readonly string[],
  partyChance: number,
  counts: DropCounts = raidDropCounts(1),
  rng: DropRng = defaultRng,
  pool: readonly ItemDef[] = RAID_DROPS,
): RaidDrop[] {
  if (pool.length === 0 || userIds.length === 0 || !(partyChance > 0) || !rng.chance(partyChance)) return [];
  const tiers = (Object.keys(counts).map(Number) as Stars[])
    .sort((a, b) => b - a)
    .map((stars) => ({ items: pool.filter((item) => item.stars === stars), count: Math.max(0, Math.floor(counts[stars] ?? 0)) }))
    .filter((tier) => tier.items.length > 0);
  return userIds.flatMap((userId) =>
    tiers.flatMap((tier) => Array.from({ length: tier.count }, () => ({ userId, item: tier.items[rng.index(tier.items.length)] as ItemDef }))),
  );
}
