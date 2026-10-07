import { randomUUID } from 'node:crypto';
import { CONFIG } from '../../config.js';
import { POKER_TABLE } from '../../constants/index.js';
import { collections } from '../../db.js';
import type { LedgerDoc } from '../../types.js';
import { ensureMember } from '../economy/index.js';
import { addVaultLoss } from '../vault.js';

/*
 * The points side of poker. A player can sit at a table for hours, so their chips are never left to
 * memory:
 *
 *  - Sitting down takes the buy-in from their balance in one conditional update, and a PokerSeatDoc
 *    is written to say "these chips are at the table".
 *  - After every hand the table saves each player's chips on it (never in the middle of a hand: a
 *    hand the bot didn't finish never happened, and everyone has the chips they started it with).
 *  - Whoever deletes the document pays the chips out: `cashOut` when the player stands up (or their
 *    page has been gone a while), or the sweeper when the table died. Deleting is atomic, so the
 *    chips are paid exactly once.
 *  - The table renews the `leaseUntil` of its seats every few seconds. A seat whose lease ran out
 *    belongs to a table that isn't being played any more (the bot restarted), so the sweeper cashes
 *    it out. A shutdown cashes out every seat of this process's tables straight away.
 *
 * The rake, and what the bots win, go into the vault (`houseTake`). The bots' chips are the house's:
 * what a player wins off a bot comes from nowhere when they cash out, like any casino win.
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

/** The seats this process has taken chips for and not paid back out yet, so a shutdown can pay them. */
const live = new Set<string>();

const leaseEnd = (): Date => new Date(Date.now() + POKER_TABLE.leaseMs);

export type BuyInResult =
  | { ok: true; seatId: string; chips: number; balance: number }
  /** Outside poker.minBuyIn .. poker.maxBuyIn. */
  | { ok: false; reason: 'out_of_range'; min: number; max: number }
  | { ok: false; reason: 'too_poor'; balance: number };

/** Takes `amount` from a member's balance and seats it at the table `tableKey` as chips. */
export async function buyIn(guildId: string, userId: string, tableKey: string, amount: number): Promise<BuyInResult> {
  const { minBuyIn, maxBuyIn } = CONFIG.poker;
  if (!Number.isSafeInteger(amount) || amount < minBuyIn || amount > maxBuyIn) return { ok: false, reason: 'out_of_range', min: minBuyIn, max: maxBuyIn };

  await ensureMember(guildId, userId);
  const { members, pokerSeats } = collections();
  const charged = await members.findOneAndUpdate({ guildId, userId, points: { $gte: amount } }, { $inc: { points: -amount } }, { returnDocument: 'after' });
  if (!charged) {
    const latest = await members.findOne({ guildId, userId });
    return { ok: false, reason: 'too_poor', balance: latest?.points ?? 0 };
  }

  const seatId = randomUUID();
  try {
    await pokerSeats.insertOne({ _id: seatId, guildId, userId, tableKey, chips: amount, boughtIn: amount, leaseUntil: leaseEnd(), createdAt: new Date() });
  } catch (err) {
    // Nothing says the chips are at a table, so give the points back.
    await members.updateOne({ guildId, userId }, { $inc: { points: amount } });
    throw err;
  }
  live.add(seatId);
  await recordLedger([{ guildId, userId, delta: -amount, reason: 'poker_buyin' }]);
  return { ok: true, seatId, chips: amount, balance: charged.points };
}

/** Saves a seat's chips, after a hand. */
export async function saveChips(seatId: string, chips: number): Promise<void> {
  await collections().pokerSeats.updateOne({ _id: seatId }, { $set: { chips: Math.max(0, Math.round(chips)), leaseUntil: leaseEnd() } });
}

/**
 * Pays a seat's chips back into its member's balance and frees it. Null when it was already paid
 * (by the sweeper, or another call). If paying fails the seat is put back, already out of lease, so
 * the sweeper pays it later.
 */
export async function cashOut(seatId: string): Promise<{ amount: number; balance: number } | null> {
  const { members, pokerSeats } = collections();
  const doc = await pokerSeats.findOneAndDelete({ _id: seatId });
  live.delete(seatId);
  if (!doc) return null;
  const amount = Math.max(0, doc.chips);
  try {
    await ensureMember(doc.guildId, doc.userId);
    const paid = await members.findOneAndUpdate({ guildId: doc.guildId, userId: doc.userId }, { $inc: { points: amount } }, { returnDocument: 'after' });
    if (!paid) throw new Error(`Member ${doc.userId} not found while cashing out poker chips`);
    if (amount > 0) await recordLedger([{ guildId: doc.guildId, userId: doc.userId, delta: amount, reason: 'poker_cashout' }]);
    return { amount, balance: paid.points };
  } catch (err) {
    console.error(`Could not cash out ${amount} poker chips for ${doc.userId}; leaving them for the sweeper:`, err);
    try {
      await pokerSeats.insertOne({ ...doc, leaseUntil: new Date(0) });
    } catch (restoreErr) {
      console.error(`Could not put poker seat ${seatId} back for the sweeper:`, restoreErr);
    }
    throw err;
  }
}

/** Pushes the lease of every seat at a table forward. Called every POKER_TABLE.heartbeatMs while the table is played. */
export async function renewSeats(tableKey: string): Promise<void> {
  await collections().pokerSeats.updateMany({ tableKey }, { $set: { leaseUntil: leaseEnd() } });
}

/** Puts points into a server's vault: the rake, and what the bots won. */
export async function houseTake(guildId: string, amount: number): Promise<void> {
  if (amount > 0) await addVaultLoss(guildId, amount);
}

/**
 * Cashes out every seat whose lease has run out, and returns how many. These belong to tables that
 * aren't being played any more; a live table keeps its seats' leases well ahead of now.
 */
export async function sweepSeats(now: Date = new Date()): Promise<number> {
  const { pokerSeats } = collections();
  let paid = 0;
  for (;;) {
    const doc = await pokerSeats.findOne({ leaseUntil: { $lt: now } });
    if (!doc) break;
    try {
      if (await cashOut(doc._id)) paid++;
    } catch {
      // cashOut logged it and put it back for the next sweep; stop so one failure isn't retried in a tight loop.
      break;
    }
  }
  return paid;
}

/** Runs the sweep now and then every POKER_TABLE.sweepMs. Returns a function that stops it. */
export function startPokerSweeper(): () => void {
  const run = async (): Promise<void> => {
    try {
      const count = await sweepSeats();
      if (count > 0) console.log(`Cashed out ${count} poker seat(s) left at tables that stopped.`);
    } catch (err) {
      console.error('The poker seat sweep failed:', err);
    }
  };
  void run();
  const timer = setInterval(() => void run(), POKER_TABLE.sweepMs);
  timer.unref();
  return () => clearInterval(timer);
}

/** For a shutdown: cashes out every seat of this process's tables, so they don't wait for the sweeper. */
export async function cashOutLiveSeats(): Promise<void> {
  for (const seatId of [...live]) {
    try {
      await cashOut(seatId);
    } catch {
      // Logged in cashOut; the sweeper pays it after the restart.
    }
  }
}
