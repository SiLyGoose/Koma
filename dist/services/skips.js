import { CONFIG } from '../config.js';
import { collections } from '../db.js';
import { dayKey } from '../lib/events/raid-week.js';
import { skipPrice, skipsUsedOn } from '../lib/game/skips.js';
import { currentHour, nextHourUnix } from '../lib/time.js';
import { claimReadyHour } from './economy/claim.js';
import { ensureMember, recordLedger } from './economy/shared.js';
/** A MemberSkip from its parts, with the shared quote: the doubling price and the member's wait. */
function memberSkip(parts) {
    const skip = {
        ...parts,
        quote: async (guildId, userId, now) => {
            const member = await collections().members.findOne({ guildId, userId });
            return {
                price: skipPrice(skip.baseCost(), skipsUsedOn(member?.skips?.[skip.id], dayKey(new Date(now)))),
                waitingUntil: member ? skip.waitingUntil(member, now) : null,
                usedUp: false,
            };
        },
    };
    return skip;
}
export const claimSkip = memberSkip({
    id: 'claim',
    baseCost: () => CONFIG.skip.claim,
    waitingUntil: (member, now) => {
        const hour = currentHour(now);
        const readyHour = claimReadyHour(member);
        return readyHour <= hour ? null : nextHourUnix(readyHour - 1);
    },
    // The claim is ready once lastClaimHour is at least one hour back with a gap of 1. Moving it back
    // only as far as last hour means STONKS! sees a one-hour wait, not the time before the last claim.
    clear: (member, now) => ({
        filter: { lastClaimHour: member.lastClaimHour, claimGapHours: member.claimGapHours ?? null },
        set: { lastClaimHour: Math.min(member.lastClaimHour, currentHour(now) - 1), claimGapHours: 1 },
    }),
    reason: 'skip_claim',
});
/** Everything that can be skipped, in the order the skip command lists them. */
export const SKIPS = [claimSkip];
export const findSkip = (id) => SKIPS.find((skip) => skip.id === id.toLowerCase());
/** What each skip costs the member right now, and whether there's a wait to skip. */
export async function getSkipQuotes(guildId, userId, now = Date.now()) {
    return Promise.all(SKIPS.map(async (skip) => ({ skip, quote: await skip.quote(guildId, userId, now) })));
}
/**
 * Pays to end the member's wait on `skip`: one conditional update that takes the price, ends the
 * wait and counts the skip, and only goes through if they can pay and nothing changed since it was
 * read (tried again if something did).
 */
export async function skipMemberCooldown(guildId, userId, skip, now = Date.now()) {
    await ensureMember(guildId, userId);
    const { members } = collections();
    const day = dayKey(new Date(now));
    for (let attempt = 0; attempt < 3; attempt++) {
        const member = await members.findOne({ guildId, userId });
        if (!member || skip.waitingUntil(member, now) === null)
            return { ok: false, reason: 'not_waiting' };
        const use = member.skips?.[skip.id] ?? null;
        const used = skipsUsedOn(use, day);
        const price = skipPrice(skip.baseCost(), used);
        if (member.points < price)
            return { ok: false, reason: 'too_poor', price, balance: member.points };
        const { filter, set } = skip.clear(member, now);
        const updated = await members.findOneAndUpdate({
            guildId,
            userId,
            points: { $gte: price },
            ...filter,
            // The skips used today are as read, so the price is still right.
            ...(use ? { [`skips.${skip.id}.day`]: use.day, [`skips.${skip.id}.count`]: use.count } : { [`skips.${skip.id}`]: null }),
        }, { $inc: { points: -price }, $set: { ...set, [`skips.${skip.id}`]: { day, count: used + 1 } } }, { returnDocument: 'after' });
        if (!updated)
            continue;
        if (price > 0)
            await recordLedger([{ guildId, userId, delta: -price, reason: skip.reason }]);
        return { ok: true, paid: price, balance: updated.points, nextPrice: skipPrice(skip.baseCost(), used + 1) };
    }
    // Something kept changing under us (another skip or claim at the same moment). Nothing was taken.
    return { ok: false, reason: 'busy' };
}
//# sourceMappingURL=skips.js.map