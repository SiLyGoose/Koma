import { collections } from '../db.js';
import type { LedgerDoc } from '../types.js';
import { ensureMember } from './economy/index.js';

/*
 * The vault pool: a running total of points lost to gambling (a losing plinko drop, a lost
 * blackjack hand) and to caught robbers' fines, kept on each server's GuildDoc (vaultPool). Any
 * game that takes points away without paying them all back out calls addVaultLoss with what was
 * lost, so a game added later feeds the vault the same way, in one extra call. The vault games
 * (src/events/greedy-heist.ts, src/events/split-or-steal.ts) put up the pool times
 * events.vault.multiplier, and call back in here to take out what they paid (vaultCost,
 * takeFromVault) and to add their fines (fineIntoVault).
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

/**
 * Records points lost to gambling, or a caught robber's fine, so a future vault game can pay
 * them out. Best effort: a failure here never undoes the game action that lost the points, it
 * just means this particular loss doesn't inflate the next vault game (logged, not thrown).
 */
export async function addVaultLoss(guildId: string, amount: number): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return;
  try {
    await collections().guilds.updateOne({ _id: guildId }, { $inc: { vaultPool: amount } }, { upsert: true });
  } catch (err) {
    console.error(`Could not add ${amount} to the vault pool in ${guildId}:`, err);
  }
}

/** The server's vault pool right now (0 if nothing has been lost yet). */
export async function getVaultPool(guildId: string): Promise<number> {
  const doc = await collections().guilds.findOne({ _id: guildId });
  return doc?.vaultPool ?? 0;
}

/**
 * Takes `amount` out of the vault pool (never below 0), once a vault game has paid out (see
 * vaultCost). Losses added to the pool while the game ran are left alone, so they carry over to
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
