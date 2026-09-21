import { CONFIG } from '../config.js';
import { ITEMS } from '../data/items.js';
import { STARS, type EquipmentDoc, type ItemCopyDoc, type ItemDef, type Stars } from '../types.js';

/*
 * The pure parts of selling items: reading what the member typed, choosing which copies to sell,
 * and working out what a sale is worth. The database side is in services/sell.ts.
 */

/** What a member asked to sell. */
export type SellRequest =
  /** One copy of an item (the least valuable one they aren't wearing). */
  | { kind: 'one'; query: string }
  /** Every copy of an item they aren't wearing. */
  | { kind: 'allOf'; query: string }
  /** Everything of a star tier they aren't wearing. */
  | { kind: 'stars'; stars: Stars };

export type ParsedSell =
  | { ok: true; request: SellRequest }
  | { ok: false; error: 'usage' | 'missing_item' | 'bad_stars' };

/**
 * Reads the words after `sell`:
 *   `<item>`          one copy
 *   `all <item>`      every copy that isn't worn
 *   `stars <1-4>`     every unworn item of a star tier (`star` works too)
 */
export function parseSellArgs(args: readonly string[]): ParsedSell {
  const words = args.map((word) => word.trim()).filter((word) => word !== '');
  if (words.length === 0) return { ok: false, error: 'usage' };

  const first = (words[0] as string).toLowerCase();
  if (first === 'all') {
    const query = words.slice(1).join(' ');
    return query === '' ? { ok: false, error: 'missing_item' } : { ok: true, request: { kind: 'allOf', query } };
  }
  if (first === 'stars' || first === 'star') {
    const wanted = words[1];
    if (words.length !== 2 || wanted === undefined || !/^\d+$/.test(wanted)) return { ok: false, error: 'bad_stars' };
    const stars = Number(wanted);
    if (!(STARS as readonly number[]).includes(stars)) return { ok: false, error: 'bad_stars' };
    return { ok: true, request: { kind: 'stars', stars: stars as Stars } };
  }
  return { ok: true, request: { kind: 'one', query: words.join(' ') } };
}

/** The ids of the copies a member is wearing (their weapon and armor slots). */
export function equippedCopyIds(equipment: EquipmentDoc | null | undefined): Set<string> {
  const ids = new Set<string>();
  for (const id of [equipment?.weapon, equipment?.armor]) {
    if (typeof id === 'string' && id !== '') ids.add(id);
  }
  return ids;
}

type CopyInfo = Pick<ItemCopyDoc, '_id' | 'level' | 'obtainedAt'>;

/**
 * The copy to sell when selling just one: the lowest level, then the one obtained most recently
 * (the opposite of the copy that gets equipped), then the highest id so the choice never varies.
 */
export function worstCopy<T extends CopyInfo>(copies: readonly T[]): T | undefined {
  let worst: T | undefined;
  for (const copy of copies) {
    if (!worst) {
      worst = copy;
      continue;
    }
    if (copy.level !== worst.level) {
      if (copy.level < worst.level) worst = copy;
    } else if (copy.obtainedAt.getTime() !== worst.obtainedAt.getTime()) {
      if (copy.obtainedAt.getTime() > worst.obtainedAt.getTime()) worst = copy;
    } else if (copy._id > worst._id) {
      worst = copy;
    }
  }
  return worst;
}

/** What one item of a star tier sells for, from the live settings. */
export function sellPrice(stars: Stars): number {
  return CONFIG.sell.price[stars];
}

/** One line of a sale: how many of an item, and what they are worth together. */
export interface SaleLine {
  item: ItemDef;
  count: number;
  each: number;
  total: number;
}

/**
 * Groups item ids into sale lines: highest star tier first, and in catalog order within a tier.
 * Ids that aren't in the catalog are left out (their star tier, so their price, is unknown).
 */
export function saleLines(itemIds: readonly string[], catalog: readonly ItemDef[] = ITEMS, price: (stars: Stars) => number = sellPrice): SaleLine[] {
  const counts = new Map<string, number>();
  for (const id of itemIds) counts.set(id, (counts.get(id) ?? 0) + 1);

  const lines: SaleLine[] = [];
  for (const item of catalog) {
    const count = counts.get(item.id);
    if (!count) continue;
    const each = price(item.stars);
    lines.push({ item, count, each, total: each * count });
  }
  return lines.sort((a, b) => b.item.stars - a.item.stars);
}

export const saleTotal = (lines: readonly SaleLine[]): number => lines.reduce((sum, line) => sum + line.total, 0);
export const saleCount = (lines: readonly SaleLine[]): number => lines.reduce((sum, line) => sum + line.count, 0);
