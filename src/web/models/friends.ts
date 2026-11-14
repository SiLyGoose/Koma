import { HEROES_BY_ID } from '../../data/heroes.js';
import { collections } from '../../db.js';

/* The friends list's members (GET /api/friends) and the hero each walks v2's town as (POST /api/friends/hero), from the database. */

/** A member of a server who plays with the bot: the heroes they own (ids) and the one they said walks the town (null: none said). */
export interface FriendMember {
  userId: string;
  heroes: string[];
  townHero: string | null;
}

export interface FriendStore {
  /** Everyone in a server the bot keeps anything for: who has heroes first, then the most points. At most `limit` of them. */
  members: (guildId: string, limit: number) => Promise<FriendMember[]>;
  /** Keeps `hero` as the one they walk the town as: false when it isn't a hero they own. */
  townHero: (guildId: string, userId: string, hero: string) => Promise<boolean>;
}

export const friendStore: FriendStore = {
  members: async (guildId, limit) =>
    collections()
      .members.aggregate<FriendMember>([
        { $match: { guildId } },
        // Only their heroes' ids, not the gear each wears.
        { $project: { _id: 0, userId: 1, points: 1, townHero: { $ifNull: ['$townHero', null] }, heroes: { $map: { input: { $objectToArray: { $ifNull: ['$heroes', {}] } }, in: '$$this.k' } } } },
        { $addFields: { owns: { $size: '$heroes' } } },
        { $sort: { owns: -1, points: -1, userId: 1 } },
        { $limit: limit },
        { $project: { userId: 1, heroes: 1, townHero: 1 } },
      ])
      .toArray(),
  townHero: async (guildId, userId, hero) => {
    // (Only a hero the bot knows: the id goes in a field's path.)
    if (!HEROES_BY_ID.has(hero)) return false;
    const kept = await collections().members.updateOne({ guildId, userId, [`heroes.${hero}`]: { $exists: true } }, { $set: { townHero: hero } });
    return kept.matchedCount === 1;
  },
};
