import { randomInt } from 'node:crypto';
import { CONFIG, STARS } from '../config.js';
import { itemsByStars } from '../data/items.js';
import type { ItemDef, Stars } from '../types.js';

/** Picks a star tier using the configured weights. */
export function rollStars(weights: Record<Stars, number> = CONFIG.gacha.starWeights): Stars {
  const total = STARS.reduce((sum, stars) => sum + weights[stars], 0);
  let roll = randomInt(0, total);
  for (const stars of STARS) {
    roll -= weights[stars];
    if (roll < 0) return stars;
  }
  return 1;
}

/** Rolls a tier, then picks uniformly among the items in that tier. */
export function rollItem(): ItemDef {
  const pool = itemsByStars(rollStars());
  return pool[randomInt(0, pool.length)] as ItemDef;
}
