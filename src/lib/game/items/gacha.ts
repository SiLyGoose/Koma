import { randomInt } from 'node:crypto';
import { CONFIG, STARS } from '../../../config.js';
import { PITY_STARS } from '../../../constants/index.js';
import { featuredItems, gachaItems, HERO_BANNER, UNIQUE_TREASURES, UNIQUE_WEAPONS } from '../../../data/items.js';
import type { BannerId, ItemDef, Stars } from '../../../types.js';
import { chance, pickRandom } from '../../random.js';

type Weights = Record<Stars, number>;
export type PitySettings = { softStart: number; hardPity: number };

/** A banner's weights for each star tier: the Hero Item banner's own, the rest the standard ones. */
export const bannerWeights = (banner: BannerId): Weights => (banner === 'hero' ? CONFIG.gacha.heroStarWeights : CONFIG.gacha.starWeights);

/**
 * The level a new copy of `item` from the gacha comes refined to: a unique weapon's or unique treasure's as King's Raid's
 * summons gave them (HERO_BANNER: now and then a unique weapon comes refined), any other's 1. `roll` is a number from 0
 * up to 1 (only tests give it).
 */
export function pulledLevel(item: ItemDef, roll: number = randomInt(0, 1_000_000) / 1_000_000): number {
  const weights = item.uniqueWeapon !== undefined ? HERO_BANNER.weaponLevels : item.uniqueTreasure !== undefined ? HERO_BANNER.treasureLevels : [1];
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let left = roll * total;
  for (let i = 0; i < weights.length; i++) {
    left -= weights[i] as number;
    if (left < 0) return i + 1;
  }
  return 1;
}

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
 *
 * `minStars` leaves out the tiers below it when the pity tier misses (a multi pull's guarantee,
 * MULTI_MIN_STARS), so the pity tier's chance is the same either way. It does nothing when no tier
 * from `minStars` up can be pulled at all.
 */
export function rollStarsAtPull(
  pullNumber: number,
  weights: Weights = CONFIG.gacha.starWeights,
  pity: PitySettings = CONFIG.gacha.pity,
  minStars: Stars = 1,
): Stars {
  const top = topChance(pullNumber, weights, pity);
  if (top >= 1 || chance(top)) return PITY_STARS;

  const others = { ...weights, [PITY_STARS]: 0 };
  if (STARS.some((stars) => stars >= minStars && weights[stars] > 0)) {
    for (const stars of STARS) if (stars < minStars) others[stars] = 0;
  }
  if (STARS.every((stars) => others[stars] <= 0)) return PITY_STARS;
  return rollStars(others);
}

/**
 * The pity-tier items (the unique treasures) made for this member: the ones whose `usableBy`
 * names them. Empty for a member with no treasure of their own. The admin only counts for
 * their own treasure here, not for everyone's (unlike canUseItem).
 */
export function ownTreasures(userId: string): ItemDef[] {
  return gachaItems(PITY_STARS).filter((item) => item.usableBy?.includes(userId) ?? false);
}

/**
 * The items a banner's guarantee can give a member: their own treasures on the standard banner, the
 * featured items on the limited one, none on the Hero Item one (it has no guarantee). They can pick which
 * of them it gives (MemberDoc.guaranteedPick and .limitedPick).
 */
export function guaranteeChoices(userId: string, banner: BannerId): ItemDef[] {
  if (banner === 'hero') return [];
  return banner === 'limited' ? featuredItems() : ownTreasures(userId);
}

/**
 * Rolls a tier, then picks uniformly among the items in that tier the gacha can pull (not raid drops
 * or limited items). `pullNumber` is which pull this is since the member's last pity-tier item on
 * this banner (1 if pity doesn't matter). `minStars` is the lowest tier it can land on (see
 * rollStarsAtPull).
 *
 * When the roll lands on the pity tier, the banner decides the pick. On the standard one, a
 * `guaranteed` pick is made only among `userId`'s own treasures (see ownTreasures) instead of the
 * whole tier. On the limited one it is one of the featured items (featuredItems) `featuredChance` of
 * the time, and always when `guaranteed`; otherwise one of the standard banner's. A `guaranteed` pick
 * is the item they picked (`pick`, an item id) when the guarantee can give it. On the Hero Item one (with its own
 * weights: bannerWeights) it is a unique weapon (UNIQUE_WEAPONS) HERO_BANNER.weaponShare of the time and a unique
 * treasure (UNIQUE_TREASURES) the rest, each of a kind as likely, and nothing is guaranteed.
 */
export function rollItem(
  pullNumber = 1,
  userId?: string,
  guaranteed = false,
  minStars: Stars = 1,
  banner: BannerId = 'standard',
  featuredChance: number = CONFIG.gacha.limited.featuredChance,
  pick?: string,
): ItemDef {
  const stars = rollStarsAtPull(pullNumber, bannerWeights(banner), undefined, minStars);
  let pool = gachaItems(stars);
  const picked = (choices: ItemDef[]): ItemDef[] => {
    const one = guaranteed ? choices.find((item) => item.id === pick) : undefined;
    return one ? [one] : choices;
  };
  if (stars === PITY_STARS && banner === 'hero') {
    // (A kind with none: the other.)
    const weapon = UNIQUE_TREASURES.length === 0 || (UNIQUE_WEAPONS.length > 0 && chance(HERO_BANNER.weaponShare));
    const kind = weapon ? UNIQUE_WEAPONS : UNIQUE_TREASURES;
    if (kind.length > 0) pool = [...kind];
  } else if (stars === PITY_STARS && banner === 'limited') {
    const featured = featuredItems();
    if (featured.length > 0 && (guaranteed || chance(featuredChance))) pool = picked(featured);
  } else if (stars === PITY_STARS && guaranteed && userId) {
    const own = ownTreasures(userId);
    if (own.length > 0) pool = picked(own);
  }
  return pickRandom(pool);
}

/**
 * Where a member's guarantee stands on a banner after they pull a pity-tier item from it.
 *
 * On the standard banner, getting one of their own treasures clears it; getting someone else's sets
 * it, so their next pity-tier item is one of their own. A member with no treasure of their own never
 * has a guarantee there. On the limited banner, a featured item clears it and any other sets it, so
 * their next pity-tier item there is a featured one. The Hero Item banner has none.
 */
export function nextGuarantee(userId: string | undefined, item: ItemDef, banner: BannerId = 'standard'): boolean {
  if (banner === 'hero') return false;
  if (banner === 'limited') {
    const featured = featuredItems();
    return featured.length > 0 && !featured.some((one) => one.id === item.id);
  }
  if (userId === undefined) return false;
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
 * `owner` carries the member's guarantee on `owner.banner` (see nextGuarantee; the standard banner
 * when left out): each pity-tier item updates it for the pulls after it, and the result says where it
 * ends up, and `owner.pick` is the item they picked for it to give (see rollItem). The guarantee works
 * whether or not pity is on. `minStars` promises at least one item of
 * that tier or better: when none of the other pulls has given one, the last pull is rolled from that
 * tier up. `roll` is only replaced in tests.
 *
 * `owner.extraChance` is the chance (0 to 1) each pull gives a second item (Pot of Greed), returned
 * apart in `extras`, in order. An extra item is a plain roll: at the chance of a first pull, never
 * counted toward pity and never starting the count over, and not part of `minStars`. A pity-tier one
 * still follows and updates the guarantee.
 */
export function rollPulls(
  counter: number,
  times: number,
  pityOn: boolean,
  roll?: (pullNumber: number, guaranteed: boolean, minStars: Stars) => ItemDef,
  owner: { userId?: string; guaranteed?: boolean; banner?: BannerId; extraChance?: number; pick?: string } = {},
  minStars: Stars = 1,
): { items: ItemDef[]; extras: ItemDef[]; counter: number; guaranteed: boolean } {
  const { userId, banner = 'standard', extraChance = 0, pick } = owner;
  let guaranteed = owner.guaranteed ?? false;
  const doRoll = roll ?? ((pullNumber: number, g: boolean, floor: Stars) => rollItem(pullNumber, userId, g, floor, banner, undefined, pick));
  const items: ItemDef[] = [];
  const extras: ItemDef[] = [];
  let best = 0;
  for (let i = 0; i < times; i++) {
    counter = pityOn ? counter + 1 : 1;
    const floor = i === times - 1 && best < minStars ? minStars : 1;
    const item = doRoll(counter, guaranteed, floor);
    items.push(item);
    best = Math.max(best, item.stars);
    if (item.stars === PITY_STARS) {
      if (pityOn) counter = 0;
      guaranteed = nextGuarantee(userId, item, banner);
    }
    if (extraChance > 0 && chance(extraChance)) {
      const extra = doRoll(1, guaranteed, 1);
      extras.push(extra);
      if (extra.stars === PITY_STARS) guaranteed = nextGuarantee(userId, extra, banner);
    }
  }
  return { items, extras, counter, guaranteed };
}
