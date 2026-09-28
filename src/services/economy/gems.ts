import { collections } from '../../db.js';
import { ensureMember, recordLedger } from './shared.js';

/*
 * komaGems: a third currency, won by beating the weekly raid, and spent forging R5 copies of 4-star
 * items into masterworks, turning on their bonuses (services/items/forge.ts). They are kept on the member (`gems`, missing means 0)
 * and shown on their balance.
 */

/** Gives a member `amount` komaGems. Returns their new total. */
export async function giveGems(guildId: string, userId: string, amount: number, reason: 'raid_gems'): Promise<number> {
  await ensureMember(guildId, userId);
  const after = await collections().members.findOneAndUpdate({ guildId, userId }, { $inc: { gems: amount } }, { returnDocument: 'after' });
  await recordLedger([{ guildId, userId, delta: 0, gemDelta: amount, reason }]);
  return after?.gems ?? amount;
}
