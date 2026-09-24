import { isAdmin } from '../config.js';
import { collections } from '../db.js';

/*
 * The one channel each server can confine the bot to: every command (message or slash) is
 * ignored outside it (see discord/dispatch.ts's isAllowedChannel check), and it's also where
 * random events (src/events) spawn. Kept in the same per-server `guilds` document as the rest of
 * that server's event state (services/events.ts), since choosing a new channel also resets the
 * next scheduled event time.
 */

/** The channel `guildId` is confined to, or null if there is no restriction (and events are off). */
export async function getChannelId(guildId: string): Promise<string | null> {
  const doc = await collections().guilds.findOne({ _id: guildId });
  return doc?.channelId ?? null;
}

export type SetChannelResult = { ok: true } | { ok: false; reason: 'forbidden' };

/**
 * Chooses the channel `guildId` is confined to, or turns the restriction (and events) off with
 * null. Only the bot admin may do this; the check lives here so no caller can skip it. The next
 * event time is cleared, so the scheduler picks a fresh random one for the new channel.
 */
export async function setChannelId(actorId: string, guildId: string, channelId: string | null): Promise<SetChannelResult> {
  if (!isAdmin(actorId)) return { ok: false, reason: 'forbidden' };
  await collections().guilds.updateOne({ _id: guildId }, { $set: { channelId, nextEventAt: null } }, { upsert: true });
  return { ok: true };
}

/** Whether a command used in `channelId` is allowed: no restriction, or this is the one channel `guildId` is confined to. */
export async function isAllowedChannel(guildId: string, channelId: string): Promise<boolean> {
  const restricted = await getChannelId(guildId);
  return restricted === null || restricted === channelId;
}
