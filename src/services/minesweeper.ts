import { collections } from '../db.js';

/*
 * The members' minesweeper records (web/games/minesweeper/room.ts counts them as boards are played):
 * one document per member per server, made the first time there is something to count.
 */

/** A member's record in a server: the mines they have opened, and the boards they helped clear. */
export interface MinesweeperStats {
  bombs: number;
  wins: number;
}

const statsId = (guildId: string, userId: string): string => `${guildId}:${userId}`;

/** A member's record so far (nothing yet: both 0). */
export async function loadMinesweeperStats(guildId: string, userId: string): Promise<MinesweeperStats> {
  const doc = await collections().minesweeperStats.findOne({ _id: statsId(guildId, userId) });
  return { bombs: doc?.bombs ?? 0, wins: doc?.wins ?? 0 };
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
