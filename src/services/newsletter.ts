import { isAdmin } from '../config.js';
import { collections } from '../db.js';
import type { RaidWeek } from '../lib/events/raid-week.js';
import type { RobEntry } from '../lib/newsletter.js';
import type { LedgerReason } from '../types.js';

/*
 * The database side of the newsletter (src/newsletter). Each server chooses its own newsletter
 * channel (kept in its `guilds` document, next to the events channel), and remembers which raid
 * week's digest it last got, so each week's goes out once even with two copies of the bot running.
 */

/** The channel `guildId`'s newsletter goes to, or null when it gets none. */
export async function getNewsletterChannelId(guildId: string): Promise<string | null> {
  const doc = await collections().guilds.findOne({ _id: guildId });
  return doc?.newsletterChannelId ?? null;
}

export type SetNewsletterChannelResult = { ok: true } | { ok: false; reason: 'forbidden' };

/**
 * Chooses the channel `guildId`'s newsletter goes to, or turns it off with null. Only the bot admin
 * may. Counts this week's digest as sent, so the first one goes out at the next reset rather than
 * straight away.
 */
export async function setNewsletterChannelId(actorId: string, guildId: string, channelId: string | null, week: RaidWeek): Promise<SetNewsletterChannelResult> {
  if (!isAdmin(actorId)) return { ok: false, reason: 'forbidden' };
  await collections().guilds.updateOne({ _id: guildId }, { $set: { newsletterChannelId: channelId, newsletterWeek: week.key } }, { upsert: true });
  return { ok: true };
}

export interface NewsletterGuild {
  guildId: string;
  channelId: string;
  /** The week whose digest it last got (or the week its channel was chosen in). */
  week: string | null;
}

/** Every server with a newsletter channel. */
export async function listNewsletterGuilds(): Promise<NewsletterGuild[]> {
  const docs = await collections()
    .guilds.find({ newsletterChannelId: { $type: 'string' } })
    .toArray();
  return docs.map((doc) => ({ guildId: doc._id, channelId: doc.newsletterChannelId as string, week: doc.newsletterWeek ?? null }));
}

/**
 * Takes `weekKey`'s digest for the server: true for the one caller that moved it there from `from`
 * (what it was when it was read), so only one copy of the bot sends it.
 */
export async function claimNewsletterWeek(guildId: string, from: string | null, weekKey: string): Promise<boolean> {
  const result = await collections().guilds.updateOne(
    { _id: guildId, newsletterChannelId: { $type: 'string' }, newsletterWeek: from },
    { $set: { newsletterWeek: weekKey } },
  );
  return result.modifiedCount === 1;
}

/** What the weekly digest is made from: the week's robs. */
export interface WeekFacts {
  robs: RobEntry[];
}

const ROB_REASONS: LedgerReason[] = ['rob_won', 'rob_slip_paid', 'rob_fine_paid'];

/** What happened in `guildId` in `week`. */
export async function weekFacts(guildId: string, week: RaidWeek): Promise<WeekFacts> {
  const robs = await collections()
    .ledger.find(
      { guildId, reason: { $in: ROB_REASONS }, createdAt: { $gte: week.start, $lt: week.next } },
      { projection: { _id: 0, userId: 1, otherUserId: 1, delta: 1, reason: 1, createdAt: 1 } },
    )
    .toArray();
  return { robs };
}
