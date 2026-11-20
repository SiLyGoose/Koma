import { collections } from '../../db.js';
import { checkBet } from '../../lib/game/casino/bet.js';
import { lostChips, sumBets } from '../../lib/game/casino/table-bets.js';
import { addVaultLoss } from '../vault.js';
import { recordLedger, ensureMember } from '../economy/shared.js';
/**
 * Every bet on the table is taken in one conditional update (so nobody can bet points they don't
 * have), the round is dealt, and what came back is added after. If adding it fails, the bets are
 * given back. Every losing bet feeds the vault on its own, even when the player's other bets won
 * more back.
 */
export async function playTableGame(guildId, userId, bets, game) {
    const bet = sumBets(bets);
    if (!Number.isSafeInteger(bet) || bet < 1)
        throw new Error(`A table bet must be a whole number of points, got ${bet}`);
    const range = checkBet(bet, game.minBet, game.maxBet);
    if (!range.ok)
        return { ok: false, reason: range.reason, limit: range.limit };
    await ensureMember(guildId, userId);
    const { members } = collections();
    const round = game.deal();
    const settled = game.settle(bets, round);
    const payout = settled.reduce((sum, b) => sum + b.returned, 0);
    const charged = await members.findOneAndUpdate({ guildId, userId, points: { $gte: bet } }, { $inc: { points: -bet } }, { returnDocument: 'after' });
    if (!charged) {
        const latest = await members.findOne({ guildId, userId });
        return { ok: false, reason: 'too_poor', balance: latest?.points ?? 0 };
    }
    let balance = charged.points;
    if (payout > 0) {
        try {
            const paid = await members.findOneAndUpdate({ guildId, userId }, { $inc: { points: payout } }, { returnDocument: 'after' });
            if (!paid)
                throw new Error(`Member ${userId} not found while paying a table win`);
            balance = paid.points;
        }
        catch (err) {
            // The round didn't happen: give the bets back.
            await members.updateOne({ guildId, userId }, { $inc: { points: bet } });
            throw err;
        }
    }
    const entries = [{ guildId, userId, delta: -bet, reason: game.reasons.bet }];
    if (payout > 0)
        entries.push({ guildId, userId, delta: payout, reason: game.reasons.payout });
    await recordLedger(entries);
    const lost = lostChips(settled);
    if (lost > 0)
        await addVaultLoss(guildId, lost);
    return { ok: true, round, bets: settled, bet, payout, net: payout - bet, balance };
}
//# sourceMappingURL=table.js.map