import { collections } from '../../db.js';
import type { LedgerDoc } from '../../types.js';

/*
 * Helpers every economy file uses: member setup, the ledger, and safe point moves.
 */

export function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;
}

/** Update pipeline that subtracts min(points, amount) from points in one atomic step. */
export function clampedDebit(amount: number) {
  return [{ $set: { points: { $subtract: ['$points', { $min: ['$points', amount] }] } } }];
}

export type LedgerInput = Omit<LedgerDoc, 'createdAt'>;

/** Best effort: a ledger failure is logged but never undoes a completed action. */
export async function recordLedger(entries: LedgerInput[]): Promise<void> {
  if (entries.length === 0) return;
  const createdAt = new Date();
  try {
    await collections().ledger.insertMany(entries.map((entry) => ({ ...entry, createdAt })));
  } catch (err) {
    console.error('Failed to write ledger entries:', err);
  }
}

/** Makes sure the member document exists. Two concurrent creators are fine. */
export async function ensureMember(guildId: string, userId: string): Promise<void> {
  try {
    await collections().members.updateOne(
      { guildId, userId },
      {
        $setOnInsert: {
          points: 0,
          lastClaimHour: -1,
          lastRobAt: null,
          lastRobbedAt: null,
          totalPulls: 0,
          pity: 0,
          guaranteed: false,
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
  }
}

/**
 * Moves up to `wanted` points from one member to another.
 * Returns null if the sender has fewer than `requireMinBalance` points (nothing moved).
 */
export async function transferClamped(
  guildId: string,
  fromId: string,
  toId: string,
  wanted: number,
  requireMinBalance: number,
): Promise<{ moved: number; fromBalance: number; toBalance: number } | null> {
  const { members } = collections();

  const from = await members.findOneAndUpdate(
    { guildId, userId: fromId, points: { $gte: requireMinBalance } },
    clampedDebit(wanted),
    { returnDocument: 'before' },
  );
  if (!from) return null;

  const moved = Math.min(wanted, from.points);
  try {
    const to = await members.findOneAndUpdate(
      { guildId, userId: toId },
      { $inc: { points: moved } },
      { returnDocument: 'after' },
    );
    if (!to) throw new Error(`Member ${toId} not found while crediting a transfer`);
    return { moved, fromBalance: from.points - moved, toBalance: to.points };
  } catch (err) {
    // Give the points back so they are never lost.
    await members.updateOne({ guildId, userId: fromId }, { $inc: { points: moved } });
    throw err;
  }
}
