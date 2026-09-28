import { CONFIG } from '../../config.js';
import { collections } from '../../db.js';
import { bestCopy } from '../../lib/game/items/copies.js';
import { loadoutCopyIds } from '../../lib/game/items/loadouts.js';
import { refineLevel } from '../../lib/game/items/refine.js';
import { equippedCopyIds } from '../../lib/game/items/sell.js';
import type { ItemDef } from '../../types.js';
import { ensureMember, recordLedger } from '../economy/shared.js';

/*
 * Forging (commands/forge.ts): a 4-star item's R5 bonus (ItemDef.bonus) only works on a copy that
 * has been forged into a masterwork with komaGems. The gems are taken first, in one conditional
 * update, then the copy is marked in another that only matches a copy still refined far enough and
 * not a masterwork yet; if that one misses, the gems are given back.
 */

export type ForgeResult =
  | { ok: true; item: ItemDef; paid: number; gemsLeft: number }
  | { ok: false; reason: 'no_bonus' | 'not_owned' | 'already' | 'busy' }
  | { ok: false; reason: 'too_low'; level: number; needed: number }
  | { ok: false; reason: 'too_poor'; price: number; gems: number };

/**
 * Forges the member's copy of `item` into a masterwork, turning on its bonus: the one they're wearing, else one saved in
 * another of their loadouts, else their best one (like refine picks).
 */
export async function forgeMasterwork(guildId: string, userId: string, item: ItemDef): Promise<ForgeResult> {
  if (!item.bonus) return { ok: false, reason: 'no_bonus' };
  const needed = item.bonus.level;
  const { items, members } = collections();
  const [copies, member] = await Promise.all([items.find({ guildId, userId, itemId: item.id }).toArray(), members.findOne({ guildId, userId })]);
  const worn = equippedCopyIds(member?.equipment);
  const kept = loadoutCopyIds(member);
  const target = copies.find((copy) => worn.has(copy._id)) ?? copies.find((copy) => kept.has(copy._id)) ?? bestCopy(copies);
  if (!target) return { ok: false, reason: 'not_owned' };
  if (target.masterwork) return { ok: false, reason: 'already' };
  const level = refineLevel(target.level);
  if (level < needed) return { ok: false, reason: 'too_low', level, needed };

  const price = CONFIG.refine.masterworkGems;
  await ensureMember(guildId, userId);
  const charged = await members.findOneAndUpdate(
    { guildId, userId, ...(price > 0 ? { gems: { $gte: price } } : {}) },
    { $inc: { gems: -price } },
    { returnDocument: 'after' },
  );
  if (!charged) return { ok: false, reason: 'too_poor', price, gems: member?.gems ?? 0 };

  const marked = await items.updateOne(
    { _id: target._id, guildId, userId, level: { $gte: needed }, masterwork: { $ne: true } },
    { $set: { masterwork: true } },
  );
  if (marked.modifiedCount === 0) {
    await members.updateOne({ guildId, userId }, { $inc: { gems: price } });
    return { ok: false, reason: 'busy' };
  }
  if (price > 0) await recordLedger([{ guildId, userId, delta: 0, gemDelta: -price, reason: 'forge', itemId: item.id }]);
  return { ok: true, item, paid: price, gemsLeft: charged.gems ?? 0 };
}
