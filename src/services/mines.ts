import { randomUUID } from 'node:crypto';
import { CONFIG } from '../config.js';
import { MINE } from '../constants/index.js';
import { collections } from '../db.js';
import { checkBet, type BetRefusal } from '../lib/game/bet.js';
import { payoutFor } from '../lib/game/mines.js';
import { sleep } from '../lib/time.js';
import { ensureMember, recordLedger } from './economy/shared.js';
import { addVaultLoss } from './vault.js';

/*
 * The points side of the mine. A run can last minutes, so it is kept the way a blackjack bet is
 * (services/blackjack.ts):
 *
 *  - The bet is taken in one conditional update when the run starts, and a MineRunDoc is written
 *    to say "these points are down the mine", with the multiplier the run is at.
 *  - Whoever deletes that document is the one that pays out: `settleRun` when the miner cashes out
 *    or hits dynamite, or the sweeper when the run was cut short. Deleting is atomic, so a run is
 *    paid exactly once whichever of them gets there first.
 *  - The run's multiplier is saved after every ore, and its `leaseUntil` renewed every few seconds
 *    while it is played. A run whose lease ran out was cut short (the bot restarted), so the
 *    sweeper cashes it out at the multiplier saved last. A run shut down properly is cashed out at once.
 */

/** The runs this process has taken bets for and not settled yet, so a shutdown can cash them out. */
const live = new Set<string>();

const leaseEnd = (): Date => new Date(Date.now() + MINE.leaseMs);

export type StartRunResult =
  /** Out of mine.minBet .. mine.maxBet, or more than they have. */
  | BetRefusal
  | { ok: true; runId: string; bet: number; balance: number };

/** Takes a bet from a member and starts a run with it, at 1x. */
export async function startMineRun(guildId: string, userId: string, bet: number): Promise<StartRunResult> {
  if (!Number.isSafeInteger(bet) || bet < 1) throw new Error(`A mine bet must be a whole number of points, got ${bet}`);
  const cfg = CONFIG.mine;
  const range = checkBet(bet, cfg.minBet, cfg.maxBet);
  if (!range.ok) return { ok: false, reason: range.reason, limit: range.limit };

  await ensureMember(guildId, userId);
  const { members, mineRuns } = collections();

  const charged = await members.findOneAndUpdate({ guildId, userId, points: { $gte: bet } }, { $inc: { points: -bet } }, { returnDocument: 'after' });
  if (!charged) {
    const latest = await members.findOne({ guildId, userId });
    return { ok: false, reason: 'too_poor', balance: latest?.points ?? 0 };
  }

  const runId = randomUUID();
  try {
    await mineRuns.insertOne({ _id: runId, guildId, userId, bet, multiplier: 1, leaseUntil: leaseEnd(), createdAt: new Date() });
  } catch (err) {
    // Nothing says the points are down the mine, so give them back.
    await members.updateOne({ guildId, userId }, { $inc: { points: bet } });
    throw err;
  }
  live.add(runId);
  await recordLedger([{ guildId, userId, delta: -bet, reason: 'mine_bet' }]);
  return { ok: true, runId, bet, balance: charged.points };
}

/** Saves the multiplier a run has reached (and renews its lease). False when the run was already settled. */
export async function saveMultiplier(runId: string, multiplier: number): Promise<boolean> {
  const result = await collections().mineRuns.updateOne({ _id: runId }, { $set: { multiplier, leaseUntil: leaseEnd() } });
  return result.matchedCount > 0;
}

/** Pushes a run's lease forward. Called every MINE.heartbeatMs while it is played. */
export async function renewMineLease(runId: string): Promise<void> {
  await collections().mineRuns.updateOne({ _id: runId }, { $set: { leaseUntil: leaseEnd() } });
}

/** Adds points to a member, trying a few times: this is the step where a payout could otherwise be lost. */
async function credit(guildId: string, userId: string, amount: number): Promise<number> {
  const { members } = collections();
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const paid = await members.findOneAndUpdate({ guildId, userId }, { $inc: { points: amount } }, { returnDocument: 'after' });
      if (!paid) throw new Error(`Member ${userId} not found while paying out mine points`);
      return paid.points;
    } catch (err) {
      lastError = err;
      await sleep(250 * (attempt + 1));
    }
  }
  throw lastError;
}

export type SettleRunResult = { ok: true; bet: number; payout: number; balance: number } | { ok: false };

/**
 * Ends a run and pays its bet times `multiplier` (0 when dynamite went off). Null multiplier means
 * "the one saved last" (the sweeper, and a shutdown). `ok: false` means the run was already settled.
 * The document is deleted first, so this can only happen once. If the points can't be paid after
 * all (the database is failing), the run is put back with its lease run out, so the sweeper pays it
 * shortly, and the failure is rethrown.
 */
export async function settleRun(runId: string, multiplier: number | null): Promise<SettleRunResult> {
  const { mineRuns, members } = collections();
  const doc = await mineRuns.findOneAndDelete({ _id: runId });
  if (!doc) return { ok: false };
  live.delete(runId);
  const { guildId, userId, bet } = doc;
  const payout = payoutFor(bet, multiplier ?? doc.multiplier);

  if (payout <= 0) {
    await addVaultLoss(guildId, bet);
    const latest = await members.findOne({ guildId, userId });
    return { ok: true, bet, payout: 0, balance: latest?.points ?? 0 };
  }
  try {
    const balance = await credit(guildId, userId, payout);
    await recordLedger([{ guildId, userId, delta: payout, reason: 'mine_payout' }]);
    return { ok: true, bet, payout, balance };
  } catch (err) {
    console.error(`Could not pay ${payout} points of mine to ${userId}; leaving them for the sweeper:`, err);
    try {
      await mineRuns.insertOne({ ...doc, multiplier: multiplier ?? doc.multiplier, leaseUntil: new Date(0) });
    } catch (again) {
      console.error(`LOST MINE PAYOUT: ${payout} points for ${userId} in server ${guildId} (run ${runId}):`, again);
    }
    throw err;
  }
}

/**
 * Cashes out every run whose lease has run out, at the multiplier it had, and returns how many.
 * These were cut short (the bot restarted). Safe to run while runs are played: a live run keeps its
 * lease well ahead of now.
 */
export async function sweepMineRuns(now: Date = new Date()): Promise<number> {
  const { mineRuns } = collections();
  let settled = 0;
  // A generous cap, so a bad document can't keep this running forever.
  for (let i = 0; i < 1000; i++) {
    const doc = await mineRuns.findOne({ leaseUntil: { $lt: now } });
    if (!doc) break;
    try {
      const paid = await settleRun(doc._id, null);
      if (paid.ok) settled++;
    } catch {
      // settleRun logged it and kept the run for the next sweep; stop so one failure isn't retried in a tight loop.
      break;
    }
  }
  return settled;
}

/** Runs the sweep now and then every MINE.sweepMs. Returns a function that stops it. */
export function startMineSweeper(): () => void {
  const run = async (): Promise<void> => {
    try {
      const count = await sweepMineRuns();
      if (count > 0) console.log(`Cashed out ${count} mine run(s) that were cut short.`);
    } catch (err) {
      console.error('The mine run sweep failed:', err);
    }
  };
  void run();
  const timer = setInterval(() => void run(), MINE.sweepMs);
  timer.unref();
  return () => clearInterval(timer);
}

/** For a shutdown: cashes out every run this process is playing, so they don't wait for the sweeper. */
export async function cashOutLiveRuns(): Promise<void> {
  for (const runId of [...live]) {
    try {
      await settleRun(runId, null);
    } catch (err) {
      console.error('Could not cash out a mine run while shutting down (the sweeper will):', err);
    }
  }
}

/** Members down the mine right now (in Discord or on the web page): one run at a time each, in each server. */
const miners = new Set<string>();
const minerKey = (guildId: string, userId: string): string => `${guildId}:${userId}`;

/** Marks a member as playing a run. False when they already are. */
export function claimMiner(guildId: string, userId: string): boolean {
  const key = minerKey(guildId, userId);
  if (miners.has(key)) return false;
  miners.add(key);
  return true;
}

export function releaseMiner(guildId: string, userId: string): void {
  miners.delete(minerKey(guildId, userId));
}
