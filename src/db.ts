import { MongoClient, type Collection } from 'mongodb';
import { optionalEnv, requireEnv } from './env.js';
import type { InventoryDoc, LedgerDoc, MemberDoc, SettingsDoc } from './types.js';

export interface Collections {
  members: Collection<MemberDoc>;
  inventory: Collection<InventoryDoc>;
  ledger: Collection<LedgerDoc>;
  settings: Collection<SettingsDoc>;
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
    inventory: db.collection<InventoryDoc>('inventory'),
    ledger: db.collection<LedgerDoc>('ledger'),
    settings: db.collection<SettingsDoc>('settings'),
  };

  await Promise.all([
    // One member document per (server, user). The unique index also makes upserts safe.
    collections.members.createIndex({ guildId: 1, userId: 1 }, { unique: true }),
    // Leaderboard lookups.
    collections.members.createIndex({ guildId: 1, points: -1 }),
    collections.inventory.createIndex({ guildId: 1, userId: 1, itemId: 1 }, { unique: true }),
    collections.ledger.createIndex({ guildId: 1, userId: 1, createdAt: -1 }),
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
