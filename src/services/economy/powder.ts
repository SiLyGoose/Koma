import { CONFIG } from '../../config.js';
import { collections } from '../../db.js';
import { ensureMember, recordLedger } from './shared.js';

/*
 * komaDust: what salvaging hero gear gives (services/items/sell.ts), as King's Raid's grinding gives Magic Powder. It is kept on
 * the member (`powder`, missing means 0), and `sell.powderPerGem` of it crafts a komaGem (King's Raid's 1,000 Fragments of
 * Infinity to a Stone of Infinity).
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
