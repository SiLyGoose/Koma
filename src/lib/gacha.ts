import { randomInt } from 'node:crypto';
import { CONFIG, STARS } from '../config.js';
import { PITY_STARS } from '../constants.js';
import { itemsByStars } from '../data/items.js';
import type { ItemDef, Stars } from '../types.js';
import { chance } from './random.js';

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
 * Rolls a tier, then picks uniformly among the items in that tier. `pullNumber` is which pull
 * this is since the member's last pity-tier item (1 if pity doesn't matter).
 */
export function rollItem(pullNumber = 1): ItemDef {
  const pool = itemsByStars(rollStarsAtPull(pullNumber));
  return pool[randomInt(0, pool.length)] as ItemDef;
}

/**
 * Rolls `times` pulls in a row for a member whose pity counter stands at `counter` (pulls since
 * their last pity-tier item, not counting these). Each pull is number counter + 1, and a
 * pity-tier item starts the count over for the pulls after it. Returns the items in order and
 * where the counter ends up. With pity off (`pityOn` false) every pull is just number 1 and the
 * counter means nothing. `roll` is only replaced in tests.
 */
export function rollPulls(
  counter: number,
  times: number,
  pityOn: boolean,
  roll: (pullNumber: number) => ItemDef = rollItem,
): { items: ItemDef[]; counter: number } {
  const items: ItemDef[] = [];
  for (let i = 0; i < times; i++) {
    counter = pityOn ? counter + 1 : 1;
    const item = roll(counter);
    items.push(item);
    if (pityOn && item.stars === PITY_STARS) counter = 0;
  }
  return { items, counter };
}
