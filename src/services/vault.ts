import { CONFIG } from '../config.js';
import { HOUR_MS, MAX_VAULT_CATCH_UP_MS } from '../constants/index.js';
import { collections } from '../db.js';
import type { LedgerDoc, LedgerReason } from '../types.js';
import { ensureMember } from './economy/index.js';

/*
 * The vault pool: a running total of points lost to gambling (a losing plinko drop, a lost
 * blackjack hand) and to caught robbers' fines, kept on each server's GuildDoc (vaultPool). Any
 * game that takes points away without paying them all back out calls addVaultLoss with what was
 * lost, so a game added later feeds the vault the same way, in one extra call. The vault games
 * (src/events/games/greedy-heist.ts, src/events/games/split-or-steal.ts) put up the pool times
 * events.vault.multiplier (the pool counting at most events.vault.maxPool, see getVaultPool), and call back in here to take out what they paid (vaultCost,
 * takeFromVault) and to add their fines (fineIntoVault). On top of that the vault grows by
 * events.vault.hourlyGrowth an hour on its own (growVaults), in every server with events on.
 */

type LedgerInput = Omit<LedgerDoc, 'createdAt'>;

/**
 * How much of the pool a payout used up. A game snapshots the pool (`basePool`) and puts up
 * `prize` (basePool times the multiplier); paying out `paid` of that prize costs the pool the same
 * share of basePool. Rounded, never more than basePool, and 0 when nothing was paid.
 */
export function vaultCost(basePool: number, prize: number, paid: number): number {
  if (!(prize > 0) || !(paid > 0) || !(basePool > 0)) return 0;
  return Math.min(basePool, Math.round((basePool * Math.min(paid, prize)) / prize));
}

/** Best effort: a ledger failure is logged but never undoes a completed action. */
async function recordLedger(entries: LedgerInput[]): Promise<void> {
  if (entries.length === 0) return;
  const createdAt = new Date();
  try {
    await collections().ledger.insertMany(entries.map((entry) => ({ ...entry, createdAt })));
  } catch (err) {
    console.error('Failed to write ledger entries:', err);
  }
}

/** events.vault.maxPool, or null when the vault has no cap. */
function vaultCap(): number | null {
  const cap = CONFIG.events.vault.maxPool;
  return cap > 0 ? cap : null;
}

/**
 * An update pipeline that adds `amount` of losses or hourly growth to the vault pool, and the same
 * to the breakdown field `counter`, never taking the pool past events.vault.maxPool: only what
 * fits is added (to the counter too, so the breakdown still adds up), and nothing once the pool is
 * at or over it. Donations skip this and can take the pool past the cap (see donateToVault); a
 * pool over it is left alone, since a vault game only ever pays out up to the cap.
 */
function addToPool(amount: number, counter: 'vaultLosses' | 'vaultGrown') {
  const cap = vaultCap();
  const pool = { $ifNull: ['$vaultPool', 0] };
  const added = cap === null ? amount : { $max: [0, { $min: [amount, { $subtract: [cap, pool] }] }] };
  return [
    { $set: { vaultAdded: added } },
    {
      $set: {
        vaultPool: { $add: [pool, '$vaultAdded'] },
        [counter]: { $add: [{ $ifNull: [`$${counter}`, 0] }, '$vaultAdded'] },
      },
    },
    { $unset: 'vaultAdded' },
  ];
}

/**
 * Records points lost to gambling, or a caught robber's fine, so a future vault game can pay
 * them out. Best effort: a failure here never undoes the game action that lost the points, it
 * just means this particular loss doesn't inflate the next vault game (logged, not thrown).
 */
export async function addVaultLoss(guildId: string, lost: number): Promise<void> {
  if (!Number.isFinite(lost) || lost <= 0) return;
  // Only part of what's lost (events.vault.lossShare) goes into the vault; the rest leaves circulation for good.
  const amount = Math.floor(lost * CONFIG.events.vault.lossShare);
  if (amount <= 0) return;
  try {
    await collections().guilds.updateOne({ _id: guildId }, addToPool(amount, 'vaultLosses'), { upsert: true });
  } catch (err) {
    console.error(`Could not add ${amount} to the vault pool in ${guildId}:`, err);
  }
}

/**
 * How much the vault grows over `elapsedMs` at `perHour`, in whole points, and how much of that
 * time those points account for (the rest carries over to the next check, so nothing is lost to
 * rounding). At most MAX_VAULT_CATCH_UP_MS is made up for; anything past that is dropped.
 */
export function vaultGrowth(elapsedMs: number, perHour: number): { amount: number; usedMs: number } {
  if (!(perHour > 0) || !(elapsedMs > 0)) return { amount: 0, usedMs: 0 };
  const capped = elapsedMs > MAX_VAULT_CATCH_UP_MS;
  const amount = Math.floor((Math.min(elapsedMs, MAX_VAULT_CATCH_UP_MS) * perHour) / HOUR_MS);
  return { amount, usedMs: capped ? elapsedMs : Math.round((amount * HOUR_MS) / perHour) };
}

/**
 * Adds the vault's hourly growth to every server with events on, for the time since it was last
 * added. A server seen for the first time just starts counting from `now`. Each server is one
 * conditional update on the time it was last grown, so two copies of the bot never both add it.
 */
export async function growVaults(now: Date = new Date()): Promise<void> {
  const perHour = CONFIG.events.vault.hourlyGrowth;
  const { guilds } = collections();
  for (const doc of await guilds.find({ channelId: { $ne: null } }).toArray()) {
    try {
      const last = doc.vaultGrownAt ?? null;
      if (last === null || perHour <= 0) {
        // Not counting yet, or growth is off: start (or keep) the clock at now, so turning it on
        // later doesn't pay out for the time it was off.
        await guilds.updateOne({ _id: doc._id, vaultGrownAt: last }, { $set: { vaultGrownAt: now } });
        continue;
      }
      const { amount, usedMs } = vaultGrowth(now.getTime() - last.getTime(), perHour);
      if (amount <= 0) continue;
      await guilds.updateOne(
        { _id: doc._id, vaultGrownAt: last },
        [...addToPool(amount, 'vaultGrown'), { $set: { vaultGrownAt: new Date(last.getTime() + usedMs) } }],
      );
    } catch (err) {
      console.error(`Could not grow the vault in ${doc._id}:`, err);
    }
  }
}

/** What's in the server's vault right now, and what the next vault game could pay out of it. */
export async function getVaultTotals(guildId: string): Promise<{ pool: number; payout: number }> {
  const doc = await collections().guilds.findOne({ _id: guildId });
  const pool = doc?.vaultPool ?? 0;
  return { pool, payout: cappedPool(pool) };
}

/** A member and a points total, for the leaderboard's donor and loss boards. */
export interface MemberTotal {
  userId: string;
  amount: number;
}

/**
 * The ledger reasons that count toward a member's losses: every casino bet and what it paid back
 * (so a win offsets a loss), and the fines and penalties that feed the vault.
 */
export const LOSS_REASONS: readonly LedgerReason[] = [
  'plinko_bet', 'plinko_payout',
  'blackjack_bet', 'blackjack_double', 'blackjack_payout', 'blackjack_refund',
  'baccarat_bet', 'baccarat_payout',
  'roulette_bet', 'roulette_payout',
  'poker_buyin', 'poker_cashout',
  'mines_bet', 'mines_payout',
  'd20_penalty', 'rob_fine_paid', 'heist_fine', 'vault_fine',
  'code_guess', 'code_refund',
  'raid_boost', 'raid_stolen', 'raid_refund',
];

/** Sums each member's ledger `delta` over `reasons` (negated), keeping those above 0, most first. */
async function topByLedger(guildId: string, reasons: readonly LedgerReason[], limit: number): Promise<MemberTotal[]> {
  const rows = await collections()
    .ledger.aggregate<{ _id: string; amount: number }>([
      { $match: { guildId, reason: { $in: [...reasons] } } },
      { $group: { _id: '$userId', amount: { $sum: { $multiply: ['$delta', -1] } } } },
      { $match: { amount: { $gt: 0 } } },
      { $sort: { amount: -1, _id: 1 } },
      { $limit: limit },
    ])
    .toArray();
  return rows.map((row) => ({ userId: row._id, amount: row.amount }));
}

/** The members who have given the most to the vault, ever. */
export function topVaultDonors(guildId: string, limit: number): Promise<MemberTotal[]> {
  return topByLedger(guildId, ['vault_donation'], limit);
}

/** The members who have lost the most, ever: casino games net of what they won back, plus fines and penalties (LOSS_REASONS). */
export function topLosers(guildId: string, limit: number): Promise<MemberTotal[]> {
  return topByLedger(guildId, LOSS_REASONS, limit);
}

/** `pool`, never more than events.vault.maxPool: the most of it a vault game pays out. */
function cappedPool(pool: number): number {
  const cap = vaultCap();
  return cap === null ? pool : Math.min(pool, cap);
}

/**
 * What a vault game can pay out of the server's vault right now: the pool, at most
 * events.vault.maxPool (0 if nothing has been put in yet). Whatever is over the cap stays in the
 * vault for the next game.
 */
export async function getVaultPool(guildId: string): Promise<number> {
  const doc = await collections().guilds.findOne({ _id: guildId });
  return cappedPool(doc?.vaultPool ?? 0);
}

/**
 * A vault game paid out `amount` of the pool (see vaultCost): takes it out (never below 0) and
 * starts the vault command's breakdown over from now, with whatever is left counted as carried
 * over. Nothing happens if nothing was paid, so a game nobody won doesn't reset the breakdown.
 */
export async function claimVault(guildId: string, amount: number, now: Date = new Date()): Promise<void> {
  if (!Number.isSafeInteger(amount) || amount <= 0) return;
  const left = { $subtract: [{ $ifNull: ['$vaultPool', 0] }, { $min: [{ $ifNull: ['$vaultPool', 0] }, amount] }] };
  try {
    await collections().guilds.updateOne({ _id: guildId }, [
      { $set: { vaultPool: left, vaultCarriedOver: left, vaultLosses: 0, vaultGrown: 0, vaultClaimedAt: now } },
    ]);
  } catch (err) {
    console.error(`Could not take ${amount} out of the vault pool in ${guildId}:`, err);
  }
}

/**
 * Takes `amount` out of the vault pool (never below 0) without it counting as a claim (a refund). Losses added to the pool while the game ran are left alone, so they carry over to
 * the next one instead of being erased by this one.
 */
export async function takeFromVault(guildId: string, amount: number): Promise<void> {
  if (!Number.isSafeInteger(amount) || amount <= 0) return;
  try {
    await collections().guilds.updateOne({ _id: guildId }, [
      { $set: { vaultPool: { $subtract: ['$vaultPool', { $min: ['$vaultPool', amount] }] } } },
    ]);
  } catch (err) {
    console.error(`Could not take ${amount} out of the vault pool in ${guildId}:`, err);
  }
}

export interface VaultFine {
  userId: string;
  /** What they actually paid, capped at what they had. */
  amount: number;
}

/** How many members are fined at the same time. */
const FINE_AT_ONCE = 10;

/**
 * Charges each member up to `fine` points, capped at what they have (like every other fine in the
 * bot, so a fine never puts anyone below 0), records the ledger entries under `reason`, and adds
 * what was collected to the vault pool. A member with fewer points than the fine still counts as
 * having paid it, they just can't lose more than they had.
 */
export async function fineIntoVault(guildId: string, userIds: readonly string[], fine: number, reason: 'heist_fine'): Promise<VaultFine[]> {
  if (userIds.length === 0 || fine <= 0) return userIds.map((userId) => ({ userId, amount: 0 }));
  const { members } = collections();

  const chargeOne = async (userId: string): Promise<VaultFine> => {
    try {
      await ensureMember(guildId, userId);
      const before = await members.findOneAndUpdate(
        { guildId, userId },
        [{ $set: { points: { $subtract: ['$points', { $min: ['$points', fine] }] } } }],
        { returnDocument: 'before' },
      );
      const amount = before ? Math.min(fine, before.points) : 0;
      return { userId, amount };
    } catch (err) {
      console.error(`Could not fine ${userId} in ${guildId} (${reason}):`, err);
      return { userId, amount: 0 };
    }
  };

  const results: VaultFine[] = [];
  for (let i = 0; i < userIds.length; i += FINE_AT_ONCE) {
    results.push(...(await Promise.all(userIds.slice(i, i + FINE_AT_ONCE).map(chargeOne))));
  }

  const fined = results.filter((r) => r.amount > 0);
  if (fined.length > 0) {
    await recordLedger(fined.map((r) => ({ guildId, userId: r.userId, delta: -r.amount, reason })));
    await addVaultLoss(guildId, fined.reduce((sum, r) => sum + r.amount, 0));
  }
  return results;
}

/**
 * Takes `amount` from a member for something that feeds the vault (a Codedle guess), in
 * one conditional update: only if they have that much. Returns false (and takes nothing) if they
 * don't. What's taken is recorded in the ledger and added to the vault pool.
 */
export async function chargeIntoVault(guildId: string, userId: string, amount: number, reason: 'code_guess'): Promise<boolean> {
  if (!Number.isSafeInteger(amount) || amount <= 0) return true;
  await ensureMember(guildId, userId);
  const charged = await collections().members.findOneAndUpdate({ guildId, userId, points: { $gte: amount } }, { $inc: { points: -amount } });
  if (!charged) return false;
  await recordLedger([{ guildId, userId, delta: -amount, reason }]);
  await addVaultLoss(guildId, amount);
  return true;
}

export type Donation =
  | { ok: true; donated: number; balance: number; pool: number; payout: number }
  | { ok: false; reason: 'too_poor'; balance: number };

/**
 * A member gives `amount` of their points to the vault (or everything they have, for 'all'), in one
 * conditional update: nothing is taken unless they have that much. Recorded in the ledger and
 * added to the vault pool in full, even past events.vault.maxPool (a vault game still only pays
 * out up to the cap; the rest waits for the next one). `pool` is the vault right after and
 * `payout` what the next vault game could pay out of it, for showing.
 */
export async function donateToVault(guildId: string, userId: string, amount: number | 'all'): Promise<Donation> {
  await ensureMember(guildId, userId);
  const { members } = collections();
  let donated: number;
  let balance: number;
  if (amount === 'all') {
    const before = await members.findOneAndUpdate({ guildId, userId, points: { $gt: 0 } }, { $set: { points: 0 } }, { returnDocument: 'before' });
    if (!before) return { ok: false, reason: 'too_poor', balance: 0 };
    donated = before.points;
    balance = 0;
  } else {
    const after = await members.findOneAndUpdate({ guildId, userId, points: { $gte: amount } }, { $inc: { points: -amount } }, { returnDocument: 'after' });
    if (!after) {
      const doc = await members.findOne({ guildId, userId });
      return { ok: false, reason: 'too_poor', balance: doc?.points ?? 0 };
    }
    donated = amount;
    balance = after.points;
  }
  await recordLedger([{ guildId, userId, delta: -donated, reason: 'vault_donation' }]);
  let pool = 0;
  try {
    const doc = await collections().guilds.findOneAndUpdate({ _id: guildId }, { $inc: { vaultPool: donated } }, { upsert: true, returnDocument: 'after' });
    pool = doc?.vaultPool ?? 0;
  } catch (err) {
    console.error(`Could not add a donation of ${donated} to the vault pool in ${guildId}:`, err);
  }
  return { ok: true, donated, balance, pool, payout: cappedPool(pool) };
}

/** Undoes chargeIntoVault: gives `amount` back and takes it back out of the vault pool. */
export async function refundFromVault(guildId: string, userId: string, amount: number, reason: 'code_refund'): Promise<void> {
  if (!Number.isSafeInteger(amount) || amount <= 0) return;
  await collections().members.updateOne({ guildId, userId }, { $inc: { points: amount } });
  await recordLedger([{ guildId, userId, delta: amount, reason }]);
  await takeFromVault(guildId, amount);
  try {
    await collections().guilds.updateOne({ _id: guildId }, [
      { $set: { vaultLosses: { $max: [0, { $subtract: [{ $ifNull: ['$vaultLosses', 0] }, amount] }] } } },
    ]);
  } catch (err) {
    console.error(`Could not take a refund of ${amount} out of the vault's losses in ${guildId}:`, err);
  }
}
