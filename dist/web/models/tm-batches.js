import { CONFIG } from '../../config.js';
import { collections } from '../../db.js';
import { batchWhere, latestBatch, startBatch, stopBatch, TM_BATCH_MOST } from '../../services/tm-batches.js';
import { DRAGONS } from '../../lib/game/dragon.js';
import { TM_BOSSES } from '../../lib/game/technomagic.js';
import { dragonRooms, technomagicRooms } from '../games/technomagic/room.js';
const bossNameOf = (batch) => (batch.raid === 'dragon' ? DRAGONS : TM_BOSSES).find((boss) => boss.id === batch.boss)?.name ?? batch.boss;
function batchView(batch) {
    return {
        id: batch._id,
        raid: batch.raid,
        boss: batch.boss,
        bossName: bossNameOf(batch),
        where: batchWhere(batch),
        mode: batch.mode === 'normal' ? 'normal' : 'hard',
        stage: batch.stage,
        heroes: batch.heroes,
        count: batch.count,
        done: batch.done,
        won: batch.won,
        lost: batch.lost,
        spent: batch.spent,
        state: batch.state,
        end: batch.end ?? null,
        current: batch.current ? { startedAt: batch.current.startedAt.getTime(), endsAt: batch.current.endsAt.getTime() } : null,
        startedAt: batch.startedAt.getTime(),
        endedAt: batch.endedAt?.getTime() ?? null,
    };
}
async function batchesView(guildId, userId) {
    const [batch, member] = await Promise.all([latestBatch(guildId, userId), collections().members.findOne({ guildId, userId }, { projection: { points: 1 } })]);
    return { batch: batch && batchView(batch), price: CONFIG.hero.backgroundPrice, most: TM_BATCH_MOST, balance: member?.points ?? 0, now: Date.now() };
}
export const tmBatchStore = {
    view: batchesView,
    start: async (guildId, userId, ask) => {
        // Not while they're in a raid's fight: their lineup's heroes are in it.
        if (technomagicRooms.fighting(guildId, userId) || dragonRooms.fighting(guildId, userId))
            return 'fighting';
        const started = await startBatch(guildId, userId, ask);
        if (typeof started === 'string')
            return started;
        // Out of every room of the raids' (their own, it was started from): no raid's room for them till it's over.
        technomagicRooms.sendAway(guildId, userId, 'background');
        dragonRooms.sendAway(guildId, userId, 'background');
        return batchesView(guildId, userId);
    },
    stop: async (guildId, userId) => ((await stopBatch(guildId, userId)) ? batchesView(guildId, userId) : 'not_found'),
};
//# sourceMappingURL=tm-batches.js.map