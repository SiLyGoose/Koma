import { CONFIG } from '../../config.js';
import { collections } from '../../db.js';
import { dealRound, settleBets, totalBet, type BaccaratBets, type BaccaratRound, type SettledBet } from '../../lib/game/baccarat.js';
import { checkBet, type BetRefusal } from '../../lib/game/bet.js';
import { addVaultLoss } from '../vault.js';
import { type LedgerInput, recordLedger, ensureMember } from './shared.js';

/*
 * Baccarat rounds.
 */

export type BaccaratResult =
  /** Every bet together out of baccarat.minBet .. baccarat.maxBet, or more than they have. */
  | BetRefusal
  | {
      ok: true;
      round: BaccaratRound;
      bets: SettledBet[];
      /** Every bet on the table. */
      bet: number;
      /** What came back, bets included. */
      payout: number;
      /** payout - bet. */
      net: number;
      balance: number;
    };

/**
 * One round of baccarat: every bet on the table is taken in one conditional update (so nobody
 * can bet points they don't have), the round is dealt, and what came back is added after. If
 * adding it fails, the bets are given back.
 */
export async function playBaccarat(guildId: string, userId: string, bets: BaccaratBets, deal: () => BaccaratRound = dealRound): Promise<BaccaratResult> {
  const bet = totalBet(bets);
  if (!Number.isSafeInteger(bet) || bet < 1) throw new Error(`A baccarat bet must be a whole number of points, got ${bet}`);
  const cfg = CONFIG.baccarat;
  const range = checkBet(bet, cfg.minBet, cfg.maxBet);
  if (!range.ok) return { ok: false, reason: range.reason, limit: range.limit };

  await ensureMember(guildId, userId);
  const { members } = collections();

  const round = deal();
  const settled = settleBets(bets, round, cfg.payout);
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
      if (!paid) throw new Error(`Member ${userId} not found while paying a baccarat win`);
      balance = paid.points;
    } catch (err) {
      // The round didn't happen: give the bets back.
      await members.updateOne({ guildId, userId }, { $inc: { points: bet } });
      throw err;
    }
  }

  const entries: LedgerInput[] = [{ guildId, userId, delta: -bet, reason: 'baccarat_bet' }];
  if (payout > 0) entries.push({ guildId, userId, delta: payout, reason: 'baccarat_payout' });
  await recordLedger(entries);

  const net = payout - bet;
  if (net < 0) await addVaultLoss(guildId, -net);

  return { ok: true, round, bets: settled, bet, payout, net, balance };
}
