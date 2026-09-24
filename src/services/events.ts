import type { OpenCrateDoc, OpenVaultDoc } from '../types.js';
import { collections } from '../db.js';
import type { CrateShare } from '../lib/events/crate.js';
import { ensureMember } from './economy/index.js';

/*
 * The database side of the random events: when each server's next event is due, and handing out
 * what an event pays. Which channel a server is confined to (and so where its events spawn) is
 * services/channel.ts's job, not this file's; `listEventGuilds` and `claimEventSlot` below just
 * read/filter on that same `channelId` field. Points only move through single conditional
 * updates, like everywhere else in the bot.
 */

/** What the scheduler needs to know about one server that has events turned on. */
export interface EventGuild {
  guildId: string;
  channelId: string;
  nextEventAt: Date | null;
}

/** Every server that has a channel to spawn events in (see services/channel.ts). */
export async function listEventGuilds(): Promise<EventGuild[]> {
  const docs = await collections().guilds.find({ channelId: { $ne: null } }).toArray();
  return docs.flatMap((doc) =>
    typeof doc.channelId === 'string' ? [{ guildId: doc._id, channelId: doc.channelId, nextEventAt: doc.nextEventAt ?? null }] : [],
  );
}

/**
 * Moves a server's next event time from `observed` (what the caller saw) to `next`, in one
 * conditional update. Returns false if it was no longer `observed`, because something else got
 * there first (another copy of the bot, or a channel change), and then the caller must do nothing.
 * `fired` also records that an event is starting now.
 */
export async function claimEventSlot(guildId: string, observed: Date | null, next: Date, fired: boolean, now: Date): Promise<boolean> {
  const set: { nextEventAt: Date; lastEventAt?: Date } = { nextEventAt: next };
  if (fired) set.lastEventAt = now;
  const claimed = await collections().guilds.findOneAndUpdate(
    { _id: guildId, nextEventAt: observed, channelId: { $ne: null } },
    { $set: set },
  );
  return claimed !== null;
}

/**
 * Saves a crate that has just been posted, so it survives a restart of the bot (see
 * `OpenCrateDoc`). Replaces whatever was saved before for the server.
 */
export async function saveOpenCrate(guildId: string, crate: Omit<OpenCrateDoc, 'grabbers'>): Promise<void> {
  await collections().guilds.updateOne({ _id: guildId }, { $set: { openCrate: { ...crate, grabbers: [] } } }, { upsert: true });
}

/** Adds a member to the saved crate's grabbers (once), but only if that crate is still the one that is open. */
export async function recordGrab(guildId: string, messageId: string, userId: string): Promise<void> {
  await collections().guilds.updateOne({ _id: guildId, 'openCrate.messageId': messageId }, { $addToSet: { 'openCrate.grabbers': userId } });
}

/**
 * Removes the saved crate, in one conditional update, and returns it (null if it was already
 * removed, or is a different crate). The caller that gets it back is the one that pays the
 * grabbers, so a crate is never paid twice, whichever copy of the bot or whichever start of the
 * bot gets here.
 */
export async function takeOpenCrate(guildId: string, messageId: string): Promise<OpenCrateDoc | null> {
  const before = await collections().guilds.findOneAndUpdate(
    { _id: guildId, 'openCrate.messageId': messageId },
    { $unset: { openCrate: '' } },
    { returnDocument: 'before' },
  );
  return before?.openCrate ?? null;
}

/** Every crate that was left open, for the bot to pick up when it starts. */
export async function listOpenCrates(): Promise<{ guildId: string; crate: OpenCrateDoc }[]> {
  const docs = await collections().guilds.find({ openCrate: { $ne: null } }).toArray();
  return docs.flatMap((doc) => (doc.openCrate ? [{ guildId: doc._id, crate: doc.openCrate }] : []));
}

export interface SharesPayout {
  /** Who was paid, in the order given. */
  paid: CrateShare[];
  /** Who could not be paid (their share was not added). */
  failed: string[];
}

/** How many members are paid at the same time. */
const PAY_AT_ONCE = 10;

/**
 * Adds each share to its member's points, under the given ledger reason. A share that fails is
 * reported and left alone, never retried, because a retry could add it twice. Shares of 0 are
 * skipped. The ledger records every payment that went through. Shared by every event that splits
 * a pile of points between whoever showed up (the point crate, the vault breaker).
 */
export async function payShares(guildId: string, shares: readonly CrateShare[], reason: 'event_crate' | 'vault_loot'): Promise<SharesPayout> {
  const { members, ledger } = collections();
  const results = new Map<string, boolean>();

  const pay = async (share: CrateShare): Promise<void> => {
    try {
      await ensureMember(guildId, share.userId);
      await members.updateOne({ guildId, userId: share.userId }, { $inc: { points: share.amount } });
      results.set(share.userId, true);
    } catch (err) {
      console.error(`Could not pay ${share.amount} points (${reason}) to ${share.userId} in ${guildId}:`, err);
      results.set(share.userId, false);
    }
  };

  const owed = shares.filter((share) => share.amount > 0);
  for (let i = 0; i < owed.length; i += PAY_AT_ONCE) {
    await Promise.all(owed.slice(i, i + PAY_AT_ONCE).map(pay));
  }

  const paid = owed.filter((share) => results.get(share.userId) === true);
  const failed = owed.filter((share) => results.get(share.userId) === false).map((share) => share.userId);

  if (paid.length > 0) {
    const createdAt = new Date();
    try {
      await ledger.insertMany(paid.map((share) => ({ guildId, userId: share.userId, delta: share.amount, reason, createdAt })));
    } catch (err) {
      console.error('Failed to write ledger entries:', err);
    }
  }
  return { paid, failed };
}

export type CratePayout = SharesPayout;

/** Splits a point crate's pile between its grabbers. Kept as its own name for existing callers and tests. */
export const payCrate = (guildId: string, shares: readonly CrateShare[]): Promise<CratePayout> => payShares(guildId, shares, 'event_crate');

/** Splits a vault breaker's prize between its crew. */
export const payVaultLoot = (guildId: string, shares: readonly CrateShare[]): Promise<SharesPayout> => payShares(guildId, shares, 'vault_loot');

// ---------------------------------------------------------------------------
// Vault breaker persistence (mirrors the point crate functions above)
// ---------------------------------------------------------------------------

/**
 * Saves a vault breaker that has just been posted, so it survives a restart of the bot (see
 * `OpenVaultDoc`). Replaces whatever was saved before for the server.
 */
export async function saveOpenVault(guildId: string, vault: Omit<OpenVaultDoc, 'joiners'>): Promise<void> {
  await collections().guilds.updateOne({ _id: guildId }, { $set: { openVault: { ...vault, joiners: [] } } }, { upsert: true });
}

/** Adds a member to the saved vault breaker's joiners (once), but only if that vault is still the one that is open. */
export async function recordJoin(guildId: string, messageId: string, userId: string): Promise<void> {
  await collections().guilds.updateOne({ _id: guildId, 'openVault.messageId': messageId }, { $addToSet: { 'openVault.joiners': userId } });
}

/**
 * Removes the saved vault breaker, in one conditional update, and returns it (null if it was
 * already removed, or is a different vault). The caller that gets it back is the one that
 * settles it, so it is never paid out or fined twice.
 */
export async function takeOpenVault(guildId: string, messageId: string): Promise<OpenVaultDoc | null> {
  const before = await collections().guilds.findOneAndUpdate(
    { _id: guildId, 'openVault.messageId': messageId },
    { $unset: { openVault: '' } },
    { returnDocument: 'before' },
  );
  return before?.openVault ?? null;
}

/** Every vault breaker that was left open, for the bot to pick up when it starts. */
export async function listOpenVaults(): Promise<{ guildId: string; vault: OpenVaultDoc }[]> {
  const docs = await collections().guilds.find({ openVault: { $ne: null } }).toArray();
  return docs.flatMap((doc) => (doc.openVault ? [{ guildId: doc._id, vault: doc.openVault }] : []));
}
