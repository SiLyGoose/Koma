import { collections } from '../../db.js';
import { ensureMember, recordLedger, transferClamped } from './shared.js';
/** `fromId` pays `toId` `amount` points, or everything they have ('all'). */
export async function pay(guildId, fromId, toId, amount) {
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
//# sourceMappingURL=pay.js.map