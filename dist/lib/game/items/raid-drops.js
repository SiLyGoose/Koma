import { randomInt } from 'node:crypto';
import { RAID_DIFFICULTY } from '../../../constants/index.js';
import { RAID_DROPS } from '../../../data/items.js';
import { chance as rollChance } from '../../random.js';
const defaultRng = { chance: rollChance, index: (max) => randomInt(0, max) };
/** The chance (0 to 1) a party of `raiders` gets raid drops when they beat the boss. */
export function raidDropChance(raiders, cfg) {
    return Math.min(1, Math.max(0, cfg.dropChance + cfg.dropChancePerRaider * Math.max(0, raiders)));
}
/** Whether raid drops are on at all (some party size has a chance at them). */
export const raidDropsOn = (cfg) => cfg.dropChance > 0 || cfg.dropChancePerRaider > 0;
/**
 * What a raid at `difficulty` drops for each raider (RAID_DIFFICULTY), `times` times over (the Weekly Boss's
 * raid.weeklyMultiplier). Top-tier items only drop at the
 * milestone levels themselves (5 and 10): one at the first, two at the second, none at the levels in
 * between. Every level drops items of the tier below: one at level 1 and one more for each level past
 * it, a milestone level adding its top-tier item instead. So level 1 is one 3-star; level 4, four;
 * level 5, one 4-star and four 3-stars; level 6, five 3-stars; level 10, two 4-stars and eight 3-stars.
 */
export function raidDropCounts(difficulty, times = 1) {
    const level = Math.min(RAID_DIFFICULTY.max, Math.max(1, Math.floor(difficulty)));
    const milestones = Math.floor(level / RAID_DIFFICULTY.milestoneEvery);
    const top = level % RAID_DIFFICULTY.milestoneEvery === 0 ? milestones : 0;
    const by = Math.max(1, Math.floor(times));
    return { [RAID_DIFFICULTY.milestoneStars]: top * by, [RAID_DIFFICULTY.stepStars]: (level - milestones) * by };
}
/**
 * Who finds which items, in the order they were given (each raider's best items first): the party
 * rolls `partyChance` once (see raidDropChance), and on a hit everyone finds `counts` of each tier.
 * A tier with no raid drops in the catalog gives nothing.
 */
export function rollRaidDrops(userIds, partyChance, counts = raidDropCounts(1), rng = defaultRng, pool = RAID_DROPS) {
    if (pool.length === 0 || userIds.length === 0 || !(partyChance > 0) || !rng.chance(partyChance))
        return [];
    const tiers = Object.keys(counts).map(Number)
        .sort((a, b) => b - a)
        .map((stars) => ({ items: pool.filter((item) => item.stars === stars), count: Math.max(0, Math.floor(counts[stars] ?? 0)) }))
        .filter((tier) => tier.items.length > 0);
    return userIds.flatMap((userId) => tiers.flatMap((tier) => Array.from({ length: tier.count }, () => ({ userId, item: tier.items[rng.index(tier.items.length)] }))));
}
//# sourceMappingURL=raid-drops.js.map