import { collections } from '../../db.js';
import { checkBet, type BetRefusal } from '../../lib/game/bet.js';
import { lostChips, sumBets, type SettledBet, type SpotBets } from '../../lib/game/table-bets.js';
import type { LedgerReason } from '../../types.js';
import { addVaultLoss } from '../vault.js';
import { type LedgerInput, recordLedger, ensureMember } from './shared.js';

/*
 * One player's round at a shared table (baccarat, roulette): the chips they had down, settled
 * against the table's round.
 */

export type TableResult<R, S extends string> =
  /** Every bet together out of the game's minBet .. maxBet, or more than they have. */
  | BetRefusal
  | {
      ok: true;
      round: R;
      bets: SettledBet<S>[];
      /** Every bet on the table. */
      bet: number;
      /** What came back, bets included. */
      payout: number;
      /** payout - bet. */
      net: number;
      balance: number;
    };

/** What a game gives playTableGame: its limits, its round, how its bets come out, and what the ledger calls them. */
export interface TableGame<R, S extends string> {
  minBet: number;
  maxBet: number;
  deal: () => R;
  settle: (bets: SpotBets<S>, round: R) => SettledBet<S>[];
  reasons: { bet: LedgerReason; payout: LedgerReason };
}

/**
 * Every bet on the table is taken in one conditional update (so nobody can bet points they don't
 * have), the round is dealt, and what came back is added after. If adding it fails, the bets are
 * given back. Every losing bet feeds the vault on its own, even when the player's other bets won
 * more back.
 */
export async function playTableGame<R, S extends string>(guildId: string, userId: string, bets: SpotBets<S>, game: TableGame<R, S>): Promise<TableResult<R, S>> {
  const bet = sumBets(bets);
  if (!Number.isSafeInteger(bet) || bet < 1) throw new Error(`A table bet must be a whole number of points, got ${bet}`);
  const range = checkBet(bet, game.minBet, game.maxBet);
  if (!range.ok) return { ok: false, reason: range.reason, limit: range.limit };

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
      if (!paid) throw new Error(`Member ${userId} not found while paying a table win`);
      balance = paid.points;
    } catch (err) {
      // The round didn't happen: give the bets back.
      await members.updateOne({ guildId, userId }, { $inc: { points: bet } });
      throw err;
    }
  }

  const entries: LedgerInput[] = [{ guildId, userId, delta: -bet, reason: game.reasons.bet }];
  if (payout > 0) entries.push({ guildId, userId, delta: payout, reason: game.reasons.payout });
  await recordLedger(entries);

  const lost = lostChips(settled);
  if (lost > 0) await addVaultLoss(guildId, lost);

  return { ok: true, round, bets: settled, bet, payout, net: payout - bet, balance };
}
