import { isAdmin } from '../config.js';
import { collections } from '../db.js';
/*
 * The one channel each server can confine the bot to: every command (message or slash) is
 * ignored outside it (see discord/dispatch.ts's isAllowedChannel check), and it's also where
 * random events (src/events) spawn, unless the server has an events channel of its own (`events`:
 * getEventsChannelId). Kept in the same per-server `guilds` document as the rest of that server's
 * event state (services/events.ts), since choosing a new channel also resets the next scheduled event time.
 */
/** The channel `guildId` is confined to, or null if there is no restriction (and events are off). */
export async function getChannelId(guildId) {
    const doc = await collections().guilds.findOne({ _id: guildId });
    return doc?.channelId ?? null;
}
/**
 * Chooses the channel `guildId` is confined to, or turns the restriction (and events) off with
 * null. Only the bot admin may do this; the check lives here so no caller can skip it. The next
 * event time is cleared, so the scheduler picks a fresh random one for the new channel.
 */
export async function setChannelId(actorId, guildId, channelId) {
    if (!isAdmin(actorId))
        return { ok: false, reason: 'forbidden' };
    await collections().guilds.updateOne({ _id: guildId }, { $set: { channelId, nextEventAt: null } }, { upsert: true });
    return { ok: true };
}
/** The channel `guildId`'s random events pop up in: its events channel, else the one it is confined to (null: events are off). */
export async function getEventsChannelId(guildId) {
    const doc = await collections().guilds.findOne({ _id: guildId });
    return doc?.eventsChannelId ?? doc?.channelId ?? null;
}
/** The events channel `guildId` chose for itself (null: none, so its events go in the channel it is confined to). */
export async function getOwnEventsChannelId(guildId) {
    const doc = await collections().guilds.findOne({ _id: guildId });
    return doc?.eventsChannelId ?? null;
}
/**
 * Chooses the channel `guildId`'s random events pop up in, or (null) goes back to the one it is confined to. Only the
 * bot admin may. The next event time is cleared, as for setChannelId.
 */
export async function setEventsChannelId(actorId, guildId, channelId) {
    if (!isAdmin(actorId))
        return { ok: false, reason: 'forbidden' };
    await collections().guilds.updateOne({ _id: guildId }, { $set: { eventsChannelId: channelId, nextEventAt: null } }, { upsert: true });
    return { ok: true };
}
/** Whether a command used in `channelId` is allowed: no restriction, or this is the one channel `guildId` is confined to. */
export async function isAllowedChannel(guildId, channelId) {
    const restricted = await getChannelId(guildId);
    return restricted === null || restricted === channelId;
}
//# sourceMappingURL=channel.js.map