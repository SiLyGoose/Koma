import { randomUUID } from 'node:crypto';
import { CONFIG } from '../config.js';
import { BLACKJACK } from '../constants/index.js';
import { collections } from '../db.js';
import { checkBet, type BetRefusal } from '../lib/game/bet.js';
import type { BlackjackBetDoc, LedgerDoc } from '../types.js';
import { ensureMember } from './economy/index.js';

/*
 * The points side of blackjack. A table can last minutes, so nothing is ever left to memory:
 *
 *  - A player's bet is taken from their balance in one conditional update when they sit down (so
 *    it is gone before a card is dealt, and can't be robbed or spent while they play), and a
 *    BlackjackBetDoc is written to say "this many points are on the table".
 *  - Whoever deletes that document is the one that pays it back out: `settleBet` at the end of a
 *    round, `refundBet` when a table is cancelled, or the sweeper when a table died. Deleting is
 *    atomic, so a bet is paid exactly once whichever of them gets there first.
 *  - The table renews the `leaseUntil` of its bets every few seconds. A bet whose lease ran out
 *    belongs to a table that isn't being played any more (the bot restarted), so the sweeper
 *    refunds it. The bets of a table that is being shut down properly are refunded straight away.
 *
 * Like the rest of the economy this uses single conditional updates, not transactions, so it works
 * on a plain standalone MongoDB as well as on Atlas.
 */

type LedgerInput = Omit<LedgerDoc, 'createdAt'>;

/** Best effort, like the ledger of every other game: a failure is logged and never undoes a completed action. */
async function recordLedger(entries: LedgerInput[]): Promise<void> {
  if (entries.length === 0) return;
  const createdAt = new Date();
  try {
    await collections().ledger.insertMany(entries.map((entry) => ({ ...entry, createdAt })));
  } catch (err) {
    console.error('Failed to write ledger entries:', err);
  }
}

/** The bets this process has taken points for and not paid back out yet, so a shutdown can return them. */
const live = new Set<string>();

const leaseEnd = (): Date => new Date(Date.now() + BLACKJACK.leaseMs);

export type PlaceBetResult =
  /** Out of blackjack.minBet .. blackjack.maxBet, or more than they have. */
  | BetRefusal
  | { ok: true; betId: string; bet: number; balance: number };

/** Takes a bet from a member and puts it on the table `gameId`. */
export async function placeBet(guildId: string, userId: string, gameId: string, bet: number): Promise<PlaceBetResult> {
  if (!Number.isSafeInteger(bet) || bet < 1) throw new Error(`A blackjack bet must be a whole number of points, got ${bet}`);
  const cfg = CONFIG.blackjack;
  const range = checkBet(bet, cfg.minBet, cfg.maxBet);
  if (!range.ok) return { ok: false, reason: range.reason, limit: range.limit };

  await ensureMember(guildId, userId);
  const { members, blackjackBets } = collections();

  const charged = await members.findOneAndUpdate({ guildId, userId, points: { $gte: bet } }, { $inc: { points: -bet } }, { returnDocument: 'after' });
  if (!charged) {
    const latest = await members.findOne({ guildId, userId });
    return { ok: false, reason: 'too_poor', balance: latest?.points ?? 0 };
  }

  const betId = randomUUID();
  try {
    await blackjackBets.insertOne({ _id: betId, guildId, userId, gameId, bet, leaseUntil: leaseEnd(), createdAt: new Date() });
  } catch (err) {
    // Nothing says the points are on a table, so give them back.
    await members.updateOne({ guildId, userId }, { $inc: { points: bet } });
    throw err;
  }
  live.add(betId);
  await recordLedger([{ guildId, userId, delta: -bet, reason: 'blackjack_bet' }]);
  return { ok: true, betId, bet, balance: charged.points };
}

export type DoubleBetResult =
  | { ok: true; bet: number; balance: number }
  | { ok: false; reason: 'too_poor'; balance: number }
  /** The bet is not on a table any more (it was already paid out or returned). Nothing was taken. */
  | { ok: false; reason: 'gone' };

/** Takes the same amount again for a double, and adds it to the bet on the table. */
export async function doubleBet(betId: string): Promise<DoubleBetResult> {
  const { members, blackjackBets } = collections();
  const doc = await blackjackBets.findOne({ _id: betId });
  if (!doc) return { ok: false, reason: 'gone' };
  const { guildId, userId } = doc;
  const extra = doc.bet;

  const charged = await members.findOneAndUpdate({ guildId, userId, points: { $gte: extra } }, { $inc: { points: -extra } }, { returnDocument: 'after' });
  if (!charged) {
    const latest = await members.findOne({ guildId, userId });
    return { ok: false, reason: 'too_poor', balance: latest?.points ?? 0 };
  }

  // Only if the bet is still as it was: a concurrent change or payout means the extra points have nowhere to go.
  let raised: BlackjackBetDoc | null = null;
  try {
    raised = await blackjackBets.findOneAndUpdate({ _id: betId, bet: extra }, { $inc: { bet: extra }, $set: { leaseUntil: leaseEnd() } }, { returnDocument: 'after' });
  } catch (err) {
    await members.updateOne({ guildId, userId }, { $inc: { points: extra } });
    throw err;
  }
  if (!raised) {
    await members.updateOne({ guildId, userId }, { $inc: { points: extra } });
    return { ok: false, reason: 'gone' };
  }
  await recordLedger([{ guildId, userId, delta: -extra, reason: 'blackjack_double' }]);
  return { ok: true, bet: raised.bet, balance: charged.points };
}

/** Adds points to a member, trying a few times: this is the step where a payout could otherwise be lost. */
async function credit(guildId: string, userId: string, amount: number): Promise<number> {
  const { members } = collections();
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const paid = await members.findOneAndUpdate({ guildId, userId }, { $inc: { points: amount } }, { returnDocument: 'after' });
      if (!paid) throw new Error(`Member ${userId} not found while paying out blackjack points`);
      return paid.points;
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}

/**
 * Takes a bet off the table and pays `amount` to its owner. The document is deleted first, so
 * this can only happen once. If the points can't be paid after all (the database is failing), the
 * amount is put back on the table as a bet that has already run out, so the sweeper pays it
 * shortly, and the failure is rethrown.
 */
async function payOut(betId: string, amountFor: (bet: number) => number, reason: 'blackjack_payout' | 'blackjack_refund'): Promise<{ amount: number; balance: number } | null> {
  const { blackjackBets, members } = collections();
  const doc = await blackjackBets.findOneAndDelete({ _id: betId });
  if (!doc) return null;
  live.delete(betId);
  const amount = amountFor(doc.bet);

  if (amount <= 0) {
    const latest = await members.findOne({ guildId: doc.guildId, userId: doc.userId });
    return { amount, balance: latest?.points ?? 0 };
  }
  try {
    const balance = await credit(doc.guildId, doc.userId, amount);
    await recordLedger([{ guildId: doc.guildId, userId: doc.userId, delta: amount, reason }]);
    return { amount, balance };
  } catch (err) {
    console.error(`Could not pay ${amount} points of blackjack to ${doc.userId}; leaving them for the sweeper:`, err);
    try {
      await blackjackBets.insertOne({ ...doc, bet: amount, leaseUntil: new Date(0) });
    } catch (again) {
      console.error(`LOST BLACKJACK PAYOUT: ${amount} points for ${doc.userId} in server ${doc.guildId} (bet ${betId}):`, again);
    }
    throw err;
  }
}

export type SettleResult = { ok: true; payout: number; balance: number } | { ok: false };

/** The round is over: pays the bet's owner `payout` points (0 when they lost). `ok: false` means the bet had already been returned. */
export async function settleBet(betId: string, payout: number): Promise<SettleResult> {
  const paid = await payOut(betId, () => payout, 'blackjack_payout');
  return paid ? { ok: true, payout: paid.amount, balance: paid.balance } : { ok: false };
}

/** The game didn't happen: gives the bet back in full. Null if it was already paid out or returned. */
export async function refundBet(betId: string): Promise<{ amount: number; balance: number } | null> {
  return payOut(betId, (bet) => bet, 'blackjack_refund');
}

/** Pushes the lease of every bet on a table forward. Called every BLACKJACK.heartbeatMs while the table is played. */
export async function renewLeases(gameId: string): Promise<void> {
  await collections().blackjackBets.updateMany({ gameId }, { $set: { leaseUntil: leaseEnd() } });
}

/**
 * Gives back every bet whose lease has run out, and returns how many. These belong to tables that
 * stopped being played (the bot restarted). It is safe to run while tables are being played: a live
 * table keeps its bets' leases well ahead of now.
 */
export async function sweepBets(now: Date = new Date()): Promise<number> {
  const { blackjackBets } = collections();
  let refunded = 0;
  // A generous cap, so a bad document can't keep this running forever.
  for (let i = 0; i < 1000; i++) {
    const doc = await blackjackBets.findOne({ leaseUntil: { $lt: now } });
    if (!doc) break;
    try {
      const paid = await refundBet(doc._id);
      if (paid) refunded++;
    } catch {
      // payOut logged it and kept the bet for the next sweep; stop so one failure isn't retried in a tight loop.
      break;
    }
  }
  return refunded;
}

/** Runs the sweep now and then every BLACKJACK.sweepMs. Returns a function that stops it. */
export function startBetSweeper(): () => void {
  const run = async (): Promise<void> => {
    try {
      const count = await sweepBets();
      if (count > 0) console.log(`Returned ${count} blackjack bet(s) from tables that were not being played any more.`);
    } catch (err) {
      console.error('The blackjack bet sweep failed:', err);
    }
  };
  void run();
  const timer = setInterval(() => void run(), BLACKJACK.sweepMs);
  timer.unref();
  return () => clearInterval(timer);
}

/** For a shutdown: gives back the bets of every table this process is running, so they don't wait for the sweeper. */
export async function refundLiveBets(): Promise<void> {
  for (const betId of [...live]) {
    try {
      await refundBet(betId);
    } catch (err) {
      console.error('Could not return a blackjack bet while shutting down (the sweeper will):', err);
    }
  }
}
