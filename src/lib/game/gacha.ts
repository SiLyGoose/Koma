import { randomInt } from 'node:crypto';
import { CONFIG, STARS } from '../../config.js';
import { PITY_STARS } from '../../constants.js';
import { itemsByStars } from '../../data/items.js';
import type { ItemDef, Stars } from '../../types.js';
import { chance } from '../random.js';

type Weights = Record<Stars, number>;
export type PitySettings = { softStart: number; hardPity: number };

/** Picks a star tier using the configured weights. */
export function rollStars(weights: Weights = CONFIG.gacha.starWeights): Stars {
  const total = STARS.reduce((sum, stars) => sum + weights[stars], 0);
  let roll = randomInt(0, total);
  for (const stars of STARS) {
    roll -= weights[stars];
    if (roll < 0) return stars;
  }
  return 1;
}

/**
 * The chance (0 to 1) that a pull is an item of the pity tier, when it is the Nth pull since the
 * member's last one (`pullNumber` counts the pull being made, so the first pull after a
 * top-tier item is 1).
 *
 *   - Before pity.softStart it is the normal chance (the tier's share of the weights).
 *   - From softStart it climbs by the same amount each pull, reaching 100% at pity.hardPity.
 *   - At hardPity and beyond it is 100%.
 *   - With pity off (hardPity 0), or while the tier's weight is 0 (it can't be pulled at all),
 *     pity changes nothing.
 */
export function topChance(
  pullNumber: number,
  weights: Weights = CONFIG.gacha.starWeights,
  pity: PitySettings = CONFIG.gacha.pity,
): number {
  const total = STARS.reduce((sum, stars) => sum + weights[stars], 0);
  const base = total > 0 ? weights[PITY_STARS] / total : 0;
  if (base <= 0 || pity.hardPity <= 0) return base;

  if (pullNumber >= pity.hardPity) return 1;
  if (pullNumber < pity.softStart) return base;

  const steps = pity.hardPity - pity.softStart + 1;
  const done = pullNumber - pity.softStart + 1;
  return base + ((1 - base) * done) / steps;
}

/**
 * Rolls a tier for the Nth pull since the member's last pity-tier item. The pity tier is rolled
 * first at its (possibly raised) chance; if it misses, the other tiers share the rest in
 * proportion to their weights. Before softStart this is the same as a plain weighted roll.
 */
export function rollStarsAtPull(
  pullNumber: number,
  weights: Weights = CONFIG.gacha.starWeights,
  pity: PitySettings = CONFIG.gacha.pity,
): Stars {
  const top = topChance(pullNumber, weights, pity);
  if (top >= 1 || chance(top)) return PITY_STARS;

  const others = { ...weights, [PITY_STARS]: 0 };
  if (STARS.every((stars) => others[stars] <= 0)) return PITY_STARS;
  return rollStars(others);
}

/**
 * The pity-tier items (the unique treasures) made for this member: the ones whose `usableBy`
 * names them. Empty for a member with no treasure of their own. The admin only counts for
 * their own treasure here, not for everyone's (unlike canUseItem).
 */
export function ownTreasures(userId: string): ItemDef[] {
  return itemsByStars(PITY_STARS).filter((item) => item.usableBy?.includes(userId) ?? false);
}

/**
 * Rolls a tier, then picks uniformly among the items in that tier. `pullNumber` is which pull
 * this is since the member's last pity-tier item (1 if pity doesn't matter). When `guaranteed`
 * is set and the roll lands on the pity tier, the pick is made only among `userId`'s own
 * treasures (see ownTreasures) instead of the whole tier.
 */
export function rollItem(pullNumber = 1, userId?: string, guaranteed = false): ItemDef {
  const stars = rollStarsAtPull(pullNumber);
  let pool = itemsByStars(stars);
  if (stars === PITY_STARS && guaranteed && userId) {
    const own = ownTreasures(userId);
    if (own.length > 0) pool = own;
  }
  return pool[randomInt(0, pool.length)] as ItemDef;
}

/**
 * Where a member's guarantee stands after they pull a pity-tier item. Getting one of their own
 * treasures clears it; getting someone else's sets it, so their next pity-tier item is one of
 * their own. A member with no treasure of their own never has a guarantee.
 */
export function nextGuarantee(userId: string, item: ItemDef): boolean {
  const own = ownTreasures(userId);
  if (own.length === 0) return false;
  return !own.some((mine) => mine.id === item.id);
}

/**
 * Rolls `times` pulls in a row for a member whose pity counter stands at `counter` (pulls since
 * their last pity-tier item, not counting these). Each pull is number counter + 1, and a
 * pity-tier item starts the count over for the pulls after it. Returns the items in order and
 * where the counter ends up. With pity off (`pityOn` false) every pull is just number 1 and the
 * counter means nothing.
 *
 * `owner` carries the member's guarantee (see nextGuarantee): each pity-tier item updates it
 * for the pulls after it, and the result says where it ends up. The guarantee works whether or
 * not pity is on. `roll` is only replaced in tests.
 */
export function rollPulls(
  counter: number,
  times: number,
  pityOn: boolean,
  roll?: (pullNumber: number, guaranteed: boolean) => ItemDef,
  owner: { userId?: string; guaranteed?: boolean } = {},
): { items: ItemDef[]; counter: number; guaranteed: boolean } {
  const { userId } = owner;
  let guaranteed = owner.guaranteed ?? false;
  const doRoll = roll ?? ((pullNumber: number, g: boolean) => rollItem(pullNumber, userId, g));
  const items: ItemDef[] = [];
  for (let i = 0; i < times; i++) {
    counter = pityOn ? counter + 1 : 1;
    const item = doRoll(counter, guaranteed);
    items.push(item);
    if (item.stars === PITY_STARS) {
      if (pityOn) counter = 0;
      if (userId) guaranteed = nextGuarantee(userId, item);
    }
  }
  return { items, counter, guaranteed };
}
