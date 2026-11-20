import { CONFIG } from '../../config.js';
import { collections } from '../../db.js';
import { rollUtOptions } from '../../lib/game/technomagic.js';
import { selectorItem, type SelectorPick } from '../mail.js';
import { addCopy } from './gacha.js';
import { ensureMember, recordLedger } from './shared.js';

/*
 * komaDust: what salvaging hero gear gives (services/items/sell.ts), as King's Raid's grinding gives Magic Powder. It is kept on
 * the member (`powder`, missing means 0), and `sell.powderPerGem` of it crafts a komaGem (King's Raid's 1,000 Fragments of
 * Infinity to a Stone of Infinity), and `sell.powderPerSelector` of it a Unique Weapon or Unique Treasure Ticket, held on the
 * member (`selectors`, as a mailbox's ticket claimed) until they use it: a unique weapon or treasure of any hero's, picked as they do.
 */

export type CraftResult = { ok: true; gems: number; powder: number } | { ok: false; reason: 'bad_count' | 'too_poor' };

/** Crafts `count` komaGems from the member's komaDust, all at once or none (too little: 'too_poor'). Returns their balances after. */
export async function craftGems(guildId: string, userId: string, count: number): Promise<CraftResult> {
  if (!Number.isInteger(count) || count < 1) return { ok: false, reason: 'bad_count' };
  const cost = Math.max(1, Math.floor(CONFIG.sell.powderPerGem)) * count;
  await ensureMember(guildId, userId);
  const after = await collections().members.findOneAndUpdate(
    { guildId, userId, powder: { $gte: cost } },
    { $inc: { powder: -cost, gems: count } },
    { returnDocument: 'after' },
  );
  if (!after) return { ok: false, reason: 'too_poor' };
  await recordLedger([{ guildId, userId, delta: 0, powderDelta: -cost, gemDelta: count, reason: 'craft_gems' }]);
  return { ok: true, gems: after.gems ?? count, powder: after.powder ?? 0 };
}

/** A Unique Weapon ('uw') or Unique Treasure ('ut') Ticket. */
export type SelectorKind = 'uw' | 'ut';

export type SelectorCraftResult = { ok: true; powder: number; selectors: Record<SelectorKind, number> } | { ok: false; reason: 'bad_count' | 'too_poor' };

/** The tickets a member holds, of each kind (missing: none). */
export const heldSelectors = (held: { uw?: number; ut?: number } | undefined): Record<SelectorKind, number> => ({ uw: held?.uw ?? 0, ut: held?.ut ?? 0 });

/** Crafts `count` tickets of kind `of` from the member's komaDust, all at once or none (too little: 'too_poor'). Their balances after. */
export async function craftSelectors(guildId: string, userId: string, of: SelectorKind, count: number): Promise<SelectorCraftResult> {
  if (!Number.isInteger(count) || count < 1) return { ok: false, reason: 'bad_count' };
  const cost = Math.max(1, Math.floor(CONFIG.sell.powderPerSelector)) * count;
  await ensureMember(guildId, userId);
  const after = await collections().members.findOneAndUpdate(
    { guildId, userId, powder: { $gte: cost } },
    { $inc: { powder: -cost, [`selectors.${of}`]: count } },
    { returnDocument: 'after' },
  );
  if (!after) return { ok: false, reason: 'too_poor' };
  await recordLedger([{ guildId, userId, delta: 0, powderDelta: -cost, itemId: `${of}-selector`, reason: 'craft_selector' }]);
  return { ok: true, powder: after.powder ?? 0, selectors: heldSelectors(after.selectors) };
}

export type SelectorUseResult = { ok: true; given: string } | { ok: false; reason: 'bad_pick' | 'not_owned' };

/** Uses one of the member's tickets of kind `of`: the unique weapon or treasure `pick` is, given them (a new copy). Its name. */
export async function useSelector(guildId: string, userId: string, of: SelectorKind, pick: SelectorPick): Promise<SelectorUseResult> {
  const item = selectorItem(of, pick);
  if (!item) return { ok: false, reason: 'bad_pick' };
  const used = await collections().members.updateOne({ guildId, userId, [`selectors.${of}`]: { $gte: 1 } }, { $inc: { [`selectors.${of}`]: -1 } });
  if (used.modifiedCount === 0) return { ok: false, reason: 'not_owned' };
  await addCopy(guildId, userId, item.id, { ...(item.uniqueTreasure && { tmPotentials: rollUtOptions() }) });
  return { ok: true, given: item.name };
}
