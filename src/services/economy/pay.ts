import { collections } from '../../db.js';
import { ensureMember, recordLedger, transferClamped } from './shared.js';

/*
 * One member paying another some of their points (commands/pay.ts): taken from the payer and given
 * to the payee as they are, with no fee. Both sides go in the ledger, each naming the other.
 */

export type PayResult =
  | { ok: true; paid: number; balance: number; theirBalance: number }
  /** They have fewer points than they asked to pay (`balance`: what they have); nothing moved. */
  | { ok: false; reason: 'too_poor'; balance: number };

/** `fromId` pays `toId` `amount` points, or everything they have ('all'). */
export async function pay(guildId: string, fromId: string, toId: string, amount: number | 'all'): Promise<PayResult> {
  await ensureMember(guildId, fromId);
  await ensureMember(guildId, toId);
  // All: whatever they have (at least 1). Otherwise exactly `amount`, or nothing.
  const moved = amount === 'all' ? await transferClamped(guildId, fromId, toId, Number.MAX_SAFE_INTEGER, 1) : await transferClamped(guildId, fromId, toId, amount, amount);
  if (!moved) {
    const doc = await collections().members.findOne({ guildId, userId: fromId });
    return { ok: false, reason: 'too_poor', balance: doc?.points ?? 0 };
  }
  await recordLedger([
    { guildId, userId: fromId, delta: -moved.moved, reason: 'pay_sent', otherUserId: toId },
    { guildId, userId: toId, delta: moved.moved, reason: 'pay_received', otherUserId: fromId },
  ]);
  return { ok: true, paid: moved.moved, balance: moved.fromBalance, theirBalance: moved.toBalance };
}
