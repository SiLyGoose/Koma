import { MongoClient } from 'mongodb';
import { optionalEnv, requireEnv } from './env.js';
let client;
let cols;
/** Connects using MONGODB_URL, creates indexes, and returns the collections. Safe to call twice. */
export async function connectDb() {
    if (cols)
        return cols;
    const mongo = new MongoClient(requireEnv('MONGODB_URL'));
    await mongo.connect();
    const db = mongo.db(optionalEnv('MONGODB_DB_NAME') ?? 'koma');
    const collections = {
        members: db.collection('members'),
        items: db.collection('items'),
        inventory: db.collection('inventory'),
        ledger: db.collection('ledger'),
        settings: db.collection('settings'),
        meta: db.collection('meta'),
        guilds: db.collection('guilds'),
        blackjackBets: db.collection('blackjack_bets'),
        minesRuns: db.collection('mines_runs'),
        oldMineRuns: db.collection('mine_runs'),
        pinecraftWorlds: db.collection('pinecraft_worlds'),
        raids: db.collection('raids'),
        pokerSeats: db.collection('poker_seats'),
        minesweeperStats: db.collection('minesweeper_stats'),
        minesweeperClears: db.collection('minesweeper_clears'),
        tmRuns: db.collection('tm_runs'),
        mail: db.collection('mail'),
        tmBatches: db.collection('tm_batches'),
    };
    await Promise.all([
        // One member document per (server, user). The unique index also makes upserts safe.
        collections.members.createIndex({ guildId: 1, userId: 1 }, { unique: true }),
        // Leaderboard lookups.
        collections.members.createIndex({ guildId: 1, points: -1 }),
        // A member's copies, and their copies of one item.
        collections.items.createIndex({ guildId: 1, userId: 1, itemId: 1 }),
        collections.ledger.createIndex({ guildId: 1, userId: 1, createdAt: -1 }),
        // The weekly newsletter's look at one kind of entry (robs) over one week in a server.
        collections.ledger.createIndex({ guildId: 1, reason: 1, createdAt: 1 }),
        // Which items a member has ever pulled or sold (the gacha's "New!"). Only entries with an item.
        collections.ledger.createIndex({ guildId: 1, userId: 1, itemId: 1 }, { partialFilterExpression: { itemId: { $exists: true } } }),
        // The sweeper looks for bets whose lease ran out; a table renews the bets it owns by game.
        collections.blackjackBets.createIndex({ leaseUntil: 1 }),
        collections.blackjackBets.createIndex({ gameId: 1 }),
        // The mine's sweeper looks for runs whose lease ran out.
        collections.minesRuns.createIndex({ leaseUntil: 1 }),
        // Pinecraft's leaderboards: a server's miners by coins earned, and by blocks dug.
        collections.pinecraftWorlds.createIndex({ guildId: 1, earned: -1 }),
        collections.pinecraftWorlds.createIndex({ guildId: 1, dugTotal: -1 }),
        // Raids left unfinished when the bot stopped are looked up by status on start.
        collections.raids.createIndex({ status: 1 }),
        // A server's latest raid in a week (the site's raid page).
        collections.raids.createIndex({ guildId: 1, weekKey: 1, createdAt: -1 }),
        collections.pokerSeats.createIndex({ leaseUntil: 1 }),
        collections.pokerSeats.createIndex({ tableKey: 1 }),
        // Minesweeper's leaderboards: a server's fastest clears of a level.
        collections.minesweeperClears.createIndex({ guildId: 1, level: 1, ms: 1 }),
        // A member's won TechnoMagic Raid runs, best stage first (the stages they have opened).
        collections.tmRuns.createIndex({ guildId: 1, userId: 1, result: 1, stage: -1 }),
        collections.mail.createIndex({ guildId: 1, userId: 1, createdAt: -1 }),
        // A member's batch of background raids running (one at most: two started at once can't both be), and their latest; and every one running (resumed as the bot starts).
        collections.tmBatches.createIndex({ guildId: 1, userId: 1 }, { unique: true, partialFilterExpression: { state: 'running' }, name: 'one_running' }),
        collections.tmBatches.createIndex({ guildId: 1, userId: 1, startedAt: -1 }),
        collections.tmBatches.createIndex({ state: 1 }),
    ]);
    client = mongo;
    cols = collections;
    return collections;
}
export function collections() {
    if (!cols)
        throw new Error('Database is not connected. Call connectDb() first.');
    return cols;
}
export async function closeDb() {
    await client?.close();
    client = undefined;
    cols = undefined;
}
//# sourceMappingURL=db.js.map