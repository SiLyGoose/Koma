import { MongoClient, type Collection } from 'mongodb';
import { optionalEnv, requireEnv } from './env.js';
import type { BlackjackBetDoc, GuildDoc, ItemCopyDoc, LedgerDoc, LegacyInventoryDoc, MemberDoc, MetaDoc, RaidDoc, SettingsDoc } from './types.js';

export interface Collections {
  members: Collection<MemberDoc>;
  /** One document per copy of an item a member owns. */
  items: Collection<ItemCopyDoc>;
  /** The old inventory (a count per item). Only read by the one-time migration. */
  inventory: Collection<LegacyInventoryDoc>;
  ledger: Collection<LedgerDoc>;
  settings: Collection<SettingsDoc>;
  meta: Collection<MetaDoc>;
  /** Per-server data that is not in the settings: the events channel and when the next event is due. */
  guilds: Collection<GuildDoc>;
  /** Points that are on a blackjack table right now (see services/blackjack.ts). */
  blackjackBets: Collection<BlackjackBetDoc>;
  /** One per server per raid week (see services/raid.ts). */
  raids: Collection<RaidDoc>;
}

let client: MongoClient | undefined;
let cols: Collections | undefined;

/** Connects using MONGODB_URL, creates indexes, and returns the collections. Safe to call twice. */
export async function connectDb(): Promise<Collections> {
  if (cols) return cols;

  const mongo = new MongoClient(requireEnv('MONGODB_URL'));
  await mongo.connect();
  const db = mongo.db(optionalEnv('MONGODB_DB_NAME') ?? 'koma');

  const collections: Collections = {
    members: db.collection<MemberDoc>('members'),
    items: db.collection<ItemCopyDoc>('items'),
    inventory: db.collection<LegacyInventoryDoc>('inventory'),
    ledger: db.collection<LedgerDoc>('ledger'),
    settings: db.collection<SettingsDoc>('settings'),
    meta: db.collection<MetaDoc>('meta'),
    guilds: db.collection<GuildDoc>('guilds'),
    blackjackBets: db.collection<BlackjackBetDoc>('blackjack_bets'),
    raids: db.collection<RaidDoc>('raids'),
  };

  await Promise.all([
    // One member document per (server, user). The unique index also makes upserts safe.
    collections.members.createIndex({ guildId: 1, userId: 1 }, { unique: true }),
    // Leaderboard lookups.
    collections.members.createIndex({ guildId: 1, points: -1 }),
    // A member's copies, and their copies of one item.
    collections.items.createIndex({ guildId: 1, userId: 1, itemId: 1 }),
    collections.ledger.createIndex({ guildId: 1, userId: 1, createdAt: -1 }),
    // The sweeper looks for bets whose lease ran out; a table renews the bets it owns by game.
    collections.blackjackBets.createIndex({ leaseUntil: 1 }),
    collections.blackjackBets.createIndex({ gameId: 1 }),
    // Raids left unfinished when the bot stopped are looked up by status on start.
    collections.raids.createIndex({ status: 1 }),
  ]);

  client = mongo;
  cols = collections;
  return collections;
}

export function collections(): Collections {
  if (!cols) throw new Error('Database is not connected. Call connectDb() first.');
  return cols;
}

export async function closeDb(): Promise<void> {
  await client?.close();
  client = undefined;
  cols = undefined;
}
