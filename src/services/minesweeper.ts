import { MINESWEEPER_BEST, MINESWEEPER_LEVEL_IDS, type MinesweeperLevel } from '../constants/index.js';
import { collections } from '../db.js';
import type { MinesweeperBest, MinesweeperClear } from '../protocol/minesweeper.js';
import { ensureMember, recordLedger } from './economy/shared.js';

/*
 * The members' minesweeper records (web/games/minesweeper/room.ts counts them as boards are played):
 * one document per member per server, made the first time there is something to count. And each
 * server's leaderboards: the fastest clears of each level, one document a clear.
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

export type { MinesweeperBest, MinesweeperClear };

/** A server's leaderboards: each level's MINESWEEPER_BEST fastest clears. */
export async function loadMinesweeperBest(guildId: string): Promise<MinesweeperBest> {
  const lists = await Promise.all(
    MINESWEEPER_LEVEL_IDS.map(async (level) => {
      const docs = await collections().minesweeperClears.find({ guildId, level }).sort({ ms: 1, at: 1 }).limit(MINESWEEPER_BEST).toArray();
      return [level, docs.map((doc): MinesweeperClear => ({ ms: doc.ms, at: doc.at.getTime(), players: doc.players }))] as const;
    }),
  );
  return Object.fromEntries(lists) as MinesweeperBest;
}

/** Keeps a clear of `level` that made its leaderboard in a server. */
export async function saveMinesweeperClear(guildId: string, level: MinesweeperLevel, clear: MinesweeperClear): Promise<void> {
  await collections().minesweeperClears.insertOne({ guildId, level, ms: clear.ms, at: new Date(clear.at), players: clear.players });
}

/** Pays each member their share (`points`, by member) of a board cleared in a server. */
export async function payMinesweeper(guildId: string, points: ReadonlyMap<string, number>): Promise<void> {
  const shares = [...points].filter(([, share]) => share > 0);
  if (shares.length === 0) return;
  await Promise.all(shares.map(([userId]) => ensureMember(guildId, userId)));
  await collections().members.bulkWrite(shares.map(([userId, share]) => ({ updateOne: { filter: { guildId, userId }, update: { $inc: { points: share } } } })));
  await recordLedger(shares.map(([userId, share]) => ({ guildId, userId, delta: share, reason: 'minesweeper_win' as const })));
}
