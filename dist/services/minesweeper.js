import { MINESWEEPER_BEST, MINESWEEPER_LEVEL_IDS } from '../constants/index.js';
import { collections } from '../db.js';
import { ensureMember, recordLedger } from './economy/shared.js';
const statsId = (guildId, userId) => `${guildId}:${userId}`;
/** A member's record so far (nothing yet: all 0). */
export async function loadMinesweeperStats(guildId, userId) {
    const doc = await collections().minesweeperStats.findOne({ _id: statsId(guildId, userId) });
    return { bombs: doc?.bombs ?? 0, wins: doc?.wins ?? 0, trolls: doc?.trolls ?? 0 };
}
/** One more of `stat` for each of `userIds` in a server. */
export async function addMinesweeperStat(guildId, userIds, stat) {
    if (userIds.length === 0)
        return;
    await collections().minesweeperStats.bulkWrite(userIds.map((userId) => ({
        updateOne: {
            filter: { _id: statsId(guildId, userId) },
            update: { $inc: { [stat]: 1 }, $setOnInsert: { guildId, userId } },
            upsert: true,
        },
    })));
}
/** A server's leaderboards: each level's MINESWEEPER_BEST fastest clears. */
export async function loadMinesweeperBest(guildId) {
    const lists = await Promise.all(MINESWEEPER_LEVEL_IDS.map(async (level) => {
        const docs = await collections().minesweeperClears.find({ guildId, level }).sort({ ms: 1, at: 1 }).limit(MINESWEEPER_BEST).toArray();
        return [level, docs.map((doc) => ({ ms: doc.ms, at: doc.at.getTime(), players: doc.players }))];
    }));
    return Object.fromEntries(lists);
}
/** Keeps a clear of `level` that made its leaderboard in a server. */
export async function saveMinesweeperClear(guildId, level, clear) {
    await collections().minesweeperClears.insertOne({ guildId, level, ms: clear.ms, at: new Date(clear.at), players: clear.players });
}
/** Pays each member their share (`points`, by member) of a board cleared in a server. */
export async function payMinesweeper(guildId, points) {
    const shares = [...points].filter(([, share]) => share > 0);
    if (shares.length === 0)
        return;
    await Promise.all(shares.map(([userId]) => ensureMember(guildId, userId)));
    await collections().members.bulkWrite(shares.map(([userId, share]) => ({ updateOne: { filter: { guildId, userId }, update: { $inc: { points: share } } } })));
    await recordLedger(shares.map(([userId, share]) => ({ guildId, userId, delta: share, reason: 'minesweeper_win' })));
}
//# sourceMappingURL=minesweeper.js.map