import { collections } from '../db.js';
import { ensureMember } from './economy/index.js';
/** A server has events on: it has a channel for them, its own events channel or the one it is confined to. */
const EVENTS_ON = { $or: [{ eventsChannelId: { $type: 'string' } }, { channelId: { $type: 'string' } }] };
/** Every server that has a channel to spawn events in (see services/channel.ts). */
export async function listEventGuilds() {
    const docs = await collections().guilds.find(EVENTS_ON).toArray();
    return docs.flatMap((doc) => {
        const channelId = doc.eventsChannelId ?? doc.channelId;
        return typeof channelId === 'string' ? [{ guildId: doc._id, channelId, nextEventAt: doc.nextEventAt ?? null }] : [];
    });
}
/**
 * Moves a server's next event time from `observed` (what the caller saw) to `next`, in one
 * conditional update. Returns false if it was no longer `observed`, because something else got
 * there first (another copy of the bot, or a channel change), and then the caller must do nothing.
 * `fired` also records that an event is starting now.
 */
export async function claimEventSlot(guildId, observed, next, fired, now) {
    const set = { nextEventAt: next };
    if (fired)
        set.lastEventAt = now;
    const claimed = await collections().guilds.findOneAndUpdate({ _id: guildId, nextEventAt: observed, ...EVENTS_ON }, { $set: set });
    return claimed !== null;
}
/**
 * Saves a crate that has just been posted, so it survives a restart of the bot (see
 * `OpenCrateDoc`). Replaces whatever was saved before for the server.
 */
export async function saveOpenCrate(guildId, crate) {
    await collections().guilds.updateOne({ _id: guildId }, { $set: { openCrate: { ...crate, grabbers: [] } } }, { upsert: true });
}
/** Adds a member to the saved crate's grabbers (once), but only if that crate is still the one that is open. */
export async function recordGrab(guildId, messageId, userId) {
    await collections().guilds.updateOne({ _id: guildId, 'openCrate.messageId': messageId }, { $addToSet: { 'openCrate.grabbers': userId } });
}
/**
 * Removes the saved crate, in one conditional update, and returns it (null if it was already
 * removed, or is a different crate). The caller that gets it back is the one that pays the
 * grabbers, so a crate is never paid twice, whichever copy of the bot or whichever start of the
 * bot gets here.
 */
export async function takeOpenCrate(guildId, messageId) {
    const before = await collections().guilds.findOneAndUpdate({ _id: guildId, 'openCrate.messageId': messageId }, { $unset: { openCrate: '' } }, { returnDocument: 'before' });
    return before?.openCrate ?? null;
}
/** Every crate that was left open, for the bot to pick up when it starts. */
export async function listOpenCrates() {
    const docs = await collections().guilds.find({ openCrate: { $ne: null } }).toArray();
    return docs.flatMap((doc) => (doc.openCrate ? [{ guildId: doc._id, crate: doc.openCrate }] : []));
}
/** How many members are paid at the same time. */
const PAY_AT_ONCE = 10;
/**
 * Adds each share to its member's points, under the given ledger reason. A share that fails is
 * reported and left alone, never retried, because a retry could add it twice. Shares of 0 are
 * skipped. The ledger records every payment that went through. Shared by every event that splits
 * a pile of points between whoever showed up (the point crate, the vault games).
 */
export async function payShares(guildId, shares, reason) {
    const { members, ledger } = collections();
    const results = new Map();
    const pay = async (share) => {
        try {
            await ensureMember(guildId, share.userId);
            await members.updateOne({ guildId, userId: share.userId }, { $inc: { points: share.amount } });
            results.set(share.userId, true);
        }
        catch (err) {
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
        }
        catch (err) {
            console.error('Failed to write ledger entries:', err);
        }
    }
    return { paid, failed };
}
/** Splits a point crate's pile between its grabbers. Kept as its own name for existing callers and tests. */
export const payCrate = (guildId, shares) => payShares(guildId, shares, 'event_crate');
//# sourceMappingURL=events.js.map