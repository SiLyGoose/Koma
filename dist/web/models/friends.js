import { HEROES_BY_ID } from '../../data/heroes.js';
import { collections } from '../../db.js';
export const friendStore = {
    members: async (guildId, limit) => collections()
        .members.aggregate([
        { $match: { guildId } },
        // Only their heroes' ids, not the gear each wears.
        { $project: { _id: 0, userId: 1, points: 1, townHero: { $ifNull: ['$townHero', null] }, heroes: { $map: { input: { $objectToArray: { $ifNull: ['$heroes', {}] } }, in: '$$this.k' } } } },
        { $addFields: { owns: { $size: '$heroes' } } },
        // (No hero: the friends list leaves them out, so they don't take up its places.)
        { $match: { owns: { $gt: 0 } } },
        { $sort: { owns: -1, points: -1, userId: 1 } },
        { $limit: limit },
        { $project: { userId: 1, heroes: 1, townHero: 1 } },
    ])
        .toArray(),
    townHero: async (guildId, userId, hero) => {
        // (Only a hero the bot knows: the id goes in a field's path.)
        if (!HEROES_BY_ID.has(hero))
            return false;
        const kept = await collections().members.updateOne({ guildId, userId, [`heroes.${hero}`]: { $exists: true } }, { $set: { townHero: hero } });
        return kept.matchedCount === 1;
    },
};
//# sourceMappingURL=friends.js.map