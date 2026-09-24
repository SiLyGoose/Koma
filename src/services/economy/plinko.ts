import { CONFIG } from '../../config.js';
import { collections } from '../../db.js';
import { checkBet, type BetRefusal } from '../../lib/game/bet.js';
import { payoutFor, rollPath, slotMultiplier, slotOf } from '../../lib/game/plinko.js';
import { chance } from '../../lib/random.js';
import { addVaultLoss } from '../vault.js';
import { type LedgerInput, recordLedger, ensureMember } from './shared.js';

/*
 * Plinko bets.
 */

export type PlinkoResult =
  /** Out of plinko.minBet .. plinko.maxBet, or more than they have. */
  | BetRefusal
  | {
      ok: true;
      bet: number;
      /** One entry per row of pegs: true when the ball bounced right. */
      path: boolean[];
      /** Where it landed, from the left starting at 0. */
      slot: number;
      multiplier: number;
      /** What the bet paid back, in whole points (0 if the slot pays nothing). */
      payout: number;
      /** payout - bet: positive when the member won points, negative when they lost some. */
      net: number;
      balance: number;
    };

/**
 * One game of plinko: the ball is dropped, the bet is taken in one conditional update (so nobody
 * can bet points they don't have, however fast they press), and the payout is added after. If
 * adding the payout fails, the bet is given back. The picture is only for show, and comes after.
 */
export async function playPlinko(
  guildId: string,
  userId: string,
  bet: number,
  goesRight: () => boolean = () => chance(0.5),
): Promise<PlinkoResult> {
  if (!Number.isSafeInteger(bet) || bet < 1) throw new Error(`A plinko bet must be a whole number of points, got ${bet}`);
  const cfg = CONFIG.plinko;
  const range = checkBet(bet, cfg.minBet, cfg.maxBet);
  if (!range.ok) return { ok: false, reason: range.reason, limit: range.limit };

  await ensureMember(guildId, userId);
  const { members } = collections();

  const path = rollPath(goesRight);
  const slot = slotOf(path);
  const multiplier = slotMultiplier(cfg.payout, slot);
  const payout = payoutFor(bet, multiplier);

  const charged = await members.findOneAndUpdate(
    { guildId, userId, points: { $gte: bet } },
    { $inc: { points: -bet } },
    { returnDocument: 'after' },
  );
  if (!charged) {
    const latest = await members.findOne({ guildId, userId });
    return { ok: false, reason: 'too_poor', balance: latest?.points ?? 0 };
  }

  let balance = charged.points;
  if (payout > 0) {
    try {
      const paid = await members.findOneAndUpdate({ guildId, userId }, { $inc: { points: payout } }, { returnDocument: 'after' });
      if (!paid) throw new Error(`Member ${userId} not found while paying a plinko win`);
      balance = paid.points;
    } catch (err) {
      // The game didn't happen: give the bet back.
      await members.updateOne({ guildId, userId }, { $inc: { points: bet } });
      throw err;
    }
  }

  const entries: LedgerInput[] = [{ guildId, userId, delta: -bet, reason: 'plinko_bet' }];
  if (payout > 0) entries.push({ guildId, userId, delta: payout, reason: 'plinko_payout' });
  await recordLedger(entries);

  const net = payout - bet;
  if (net < 0) await addVaultLoss(guildId, -net);

  return { ok: true, bet, path, slot, multiplier, payout, net, balance };
}
