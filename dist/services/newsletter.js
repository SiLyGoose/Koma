import { isAdmin } from '../config.js';
import { collections } from '../db.js';
/*
 * The database side of the newsletter (src/newsletter). Each server chooses its own newsletter
 * channel (kept in its `guilds` document, next to the events channel), and remembers which raid
 * week's digest it last got, so each week's goes out once even with two copies of the bot running.
 */
/** The channel `guildId`'s newsletter goes to, or null when it gets none. */
export async function getNewsletterChannelId(guildId) {
    const doc = await collections().guilds.findOne({ _id: guildId });
    return doc?.newsletterChannelId ?? null;
}
/**
 * Chooses the channel `guildId`'s newsletter goes to, or turns it off with null. Only the bot admin
 * may. Counts this week's digest as sent, so the first one goes out at the next reset rather than
 * straight away.
 */
export async function setNewsletterChannelId(actorId, guildId, channelId, week) {
    if (!isAdmin(actorId))
        return { ok: false, reason: 'forbidden' };
    await collections().guilds.updateOne({ _id: guildId }, { $set: { newsletterChannelId: channelId, newsletterWeek: week.key } }, { upsert: true });
    return { ok: true };
}
/** The message `guildId`'s members react to for their notification roles, or null when none was posted. */
export async function getRoleMessageId(guildId) {
    const doc = await collections().guilds.findOne({ _id: guildId }, { projection: { roleMessageId: 1 } });
    return doc?.roleMessageId ?? null;
}
export async function setRoleMessageId(guildId, messageId) {
    await collections().guilds.updateOne({ _id: guildId }, { $set: { roleMessageId: messageId } }, { upsert: true });
}
/** Every server with a newsletter channel. */
export async function listNewsletterGuilds() {
    const docs = await collections()
        .guilds.find({ newsletterChannelId: { $type: 'string' } })
        .toArray();
    return docs.map((doc) => ({ guildId: doc._id, channelId: doc.newsletterChannelId, week: doc.newsletterWeek ?? null }));
}
/**
 * Takes `weekKey`'s digest for the server: true for the one caller that moved it there from `from`
 * (what it was when it was read), so only one copy of the bot sends it.
 */
export async function claimNewsletterWeek(guildId, from, weekKey) {
    const result = await collections().guilds.updateOne({ _id: guildId, newsletterChannelId: { $type: 'string' }, newsletterWeek: from }, { $set: { newsletterWeek: weekKey } });
    return result.modifiedCount === 1;
}
const ROB_REASONS = ['rob_won', 'rob_slip_paid', 'rob_fine_paid'];
/** What happened in `guildId` in `week`. */
export async function weekFacts(guildId, week) {
    const robs = await collections()
        .ledger.find({ guildId, reason: { $in: ROB_REASONS }, createdAt: { $gte: week.start, $lt: week.next } }, { projection: { _id: 0, userId: 1, otherUserId: 1, delta: 1, reason: 1, createdAt: 1 } })
        .toArray();
    return { robs };
}
//# sourceMappingURL=newsletter.js.map