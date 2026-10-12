import { CONFIG } from '../config.js';
import { collections } from '../db.js';
import { raidWeek } from '../lib/events/raid-week.js';
import { raidShopStock, refreshPrice, refreshesUsed } from '../lib/game/items/raid-shop.js';
import type { ItemDef } from '../types.js';
import { addCopy } from './economy/index.js';
import { ensureMember, recordLedger } from './economy/shared.js';

/*
 * The raid shop's database side (lib/game/items/raid-shop.ts has the rules).
 *
 * Buying: a copy of a raid item on the member's shelf this week, for komaGems. The gems are taken
 * first, in one conditional update that only matches while the member has enough (so two buys at once
 * can't both spend the same gems), then the copy is made; if making it fails, the gems are given back.
 *
 * Refreshing: the gems are taken and the week's count raised in one conditional update that only
 * matches while the member has the gems and the count is still what the price was worked out from, so
 * two refreshes at once can't both be had for the cheaper price (or go past the week's limit).
 */

export type BuyRaidItemResult =
  | { ok: true; item: ItemDef; paid: number; gemsLeft: number; count: number }
  /** Not a raid item, or not on the member's shelf this week. */
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'too_poor'; price: number; gems: number };

/** Buys the member one copy of raid item `itemId` from their shelf, as it stands at `now`. */
export async function buyRaidItem(guildId: string, userId: string, itemId: string, now: Date = new Date()): Promise<BuyRaidItemResult> {
  const { members } = collections();
  const week = raidWeek(now).key;
  const before = await members.findOne({ guildId, userId }, { projection: { raidShop: 1 } });
  const shelf = raidShopStock(guildId, week, CONFIG.raid.shop, { userId, refreshes: refreshesUsed(before?.raidShop, week) });
  const entry = shelf.find((e) => e.item.id === itemId);
  if (!entry) return { ok: false, reason: 'not_found' };
  const { item, price } = entry;
  await ensureMember(guildId, userId);
  const charged = await members.findOneAndUpdate(
    { guildId, userId, ...(price > 0 ? { gems: { $gte: price } } : {}) },
    { $inc: { gems: -price } },
    { returnDocument: 'after' },
  );
  if (!charged) {
    const member = await members.findOne({ guildId, userId });
    return { ok: false, reason: 'too_poor', price, gems: member?.gems ?? 0 };
  }

  let count: number;
  try {
    ({ count } = await addCopy(guildId, userId, item.id));
  } catch (err) {
    await members.updateOne({ guildId, userId }, { $inc: { gems: price } });
    throw err;
  }
  if (price > 0) await recordLedger([{ guildId, userId, delta: 0, gemDelta: -price, reason: 'raid_shop', itemId: item.id }]);
  return { ok: true, item, paid: price, gemsLeft: charged.gems ?? 0, count };
}

export type RefreshRaidShopResult =
  | { ok: true; paid: number; gemsLeft: number; refreshes: number }
  /** They've had all of this week's refreshes (or refreshing is off). */
  | { ok: false; reason: 'no_refreshes' }
  | { ok: false; reason: 'too_poor'; price: number; gems: number }
  /** Something else of theirs changed it at the same moment: nothing was spent. */
  | { ok: false; reason: 'busy' };

/** Pays for a new shelf for the member (their next refresh of the week at `now`). */
export async function refreshRaidShop(guildId: string, userId: string, now: Date = new Date()): Promise<RefreshRaidShopResult> {
  const { members } = collections();
  const week = raidWeek(now).key;
  await ensureMember(guildId, userId);
  const member = await members.findOne({ guildId, userId });
  const used = refreshesUsed(member?.raidShop, week);
  const price = refreshPrice(used, CONFIG.raid.shop);
  if (price === null) return { ok: false, reason: 'no_refreshes' };
  const gems = member?.gems ?? 0;
  if (gems < price) return { ok: false, reason: 'too_poor', price, gems };

  // Only while what's kept on them is still what the price came from (nothing kept, or that week and count).
  const kept = member?.raidShop;
  const charged = await members.findOneAndUpdate(
    {
      guildId,
      userId,
      ...(price > 0 ? { gems: { $gte: price } } : {}),
      ...(kept ? { 'raidShop.week': kept.week, 'raidShop.refreshes': kept.refreshes } : { raidShop: { $exists: false } }),
    },
    { $inc: { gems: -price }, $set: { raidShop: { week, refreshes: used + 1 } } },
    { returnDocument: 'after' },
  );
  if (!charged) return { ok: false, reason: 'busy' };
  if (price > 0) await recordLedger([{ guildId, userId, delta: 0, gemDelta: -price, reason: 'raid_shop_refresh' }]);
  return { ok: true, paid: price, gemsLeft: charged.gems ?? 0, refreshes: used + 1 };
}
