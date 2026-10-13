import { collections } from '../db.js';
import { ensureMember, recordLedger } from './economy/shared.js';

/*
 * The members' minesweeper records (web/games/minesweeper/room.ts counts them as boards are played):
 * one document per member per server, made the first time there is something to count.
 */

/**
 * A member's record in a server: the mines they have opened, the boards they helped clear, and the
 * times a wrong flag of theirs sent someone else's chord into a mine (which isn't a mine of theirs).
 */
export interface MinesweeperStats {
  bombs: number;
  wins: number;
  trolls: number;
}

const statsId = (guildId: string, userId: string): string => `${guildId}:${userId}`;

/** A member's record so far (nothing yet: all 0). */
export async function loadMinesweeperStats(guildId: string, userId: string): Promise<MinesweeperStats> {
  const doc = await collections().minesweeperStats.findOne({ _id: statsId(guildId, userId) });
  return { bombs: doc?.bombs ?? 0, wins: doc?.wins ?? 0, trolls: doc?.trolls ?? 0 };
}

/** One more of `stat` for each of `userIds` in a server. */
export async function addMinesweeperStat(guildId: string, userIds: readonly string[], stat: keyof MinesweeperStats): Promise<void> {
  if (userIds.length === 0) return;
  await collections().minesweeperStats.bulkWrite(
    userIds.map((userId) => ({
      updateOne: {
        filter: { _id: statsId(guildId, userId) },
        update: { $inc: { [stat]: 1 }, $setOnInsert: { guildId, userId } },
        upsert: true,
      },
    })),
  );
}

/** Pays each member their share (`points`, by member) of a board cleared in a server. */
export async function payMinesweeper(guildId: string, points: ReadonlyMap<string, number>): Promise<void> {
  const shares = [...points].filter(([, share]) => share > 0);
  if (shares.length === 0) return;
  await Promise.all(shares.map(([userId]) => ensureMember(guildId, userId)));
  await collections().members.bulkWrite(shares.map(([userId, share]) => ({ updateOne: { filter: { guildId, userId }, update: { $inc: { points: share } } } })));
  await recordLedger(shares.map(([userId, share]) => ({ guildId, userId, delta: share, reason: 'minesweeper_win' as const })));
}
