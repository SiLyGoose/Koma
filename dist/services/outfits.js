import { CONFIG } from '../config.js';
import { DEFAULT_OUTFIT, OUTFITS_BY_ID } from '../data/outfits.js';
import { collections } from '../db.js';
import { ensureMember, recordLedger } from './economy/shared.js';
import { gearChanged } from './items/gear-events.js';
/** The outfits a member has, in the shop's order: the default, and those they bought that still exist. */
export const ownedOutfits = (member) => {
    const bought = new Set(member?.outfits ?? []);
    return [...OUTFITS_BY_ID.keys()].filter((id) => id === DEFAULT_OUTFIT || bought.has(id));
};
/** The outfit a member wears: the default when they never picked one (or it's no longer theirs). */
export const wornOutfit = (member) => {
    const outfit = member?.outfit;
    return outfit && ownedOutfits(member).includes(outfit) ? outfit : DEFAULT_OUTFIT;
};
/** The outfit member `userId` wears in `guildId`. */
export async function outfitOf(guildId, userId) {
    return wornOutfit(await collections().members.findOne({ guildId, userId }, { projection: { outfits: 1, outfit: 1 } }));
}
/** Buys outfit `id` for the member (it isn't put on). */
export async function buyOutfit(guildId, userId, id) {
    if (!OUTFITS_BY_ID.has(id))
        return { ok: false, reason: 'not_found' };
    if (id === DEFAULT_OUTFIT)
        return { ok: false, reason: 'owned' };
    const price = CONFIG.outfit.price;
    const { members } = collections();
    await ensureMember(guildId, userId);
    const bought = await members.findOneAndUpdate({ guildId, userId, outfits: { $ne: id }, points: { $gte: price } }, { $inc: { points: -price }, $addToSet: { outfits: id } }, { returnDocument: 'after' });
    if (!bought) {
        const member = await members.findOne({ guildId, userId });
        return { ok: false, reason: member?.outfits?.includes(id) ? 'owned' : 'too_poor' };
    }
    if (price > 0)
        await recordLedger([{ guildId, userId, delta: -price, reason: 'outfit', itemId: id }]);
    return { ok: true, paid: price, balance: bought.points };
}
/** Puts on outfit `id`, which must be one of the member's. */
export async function wearOutfit(guildId, userId, id) {
    if (!OUTFITS_BY_ID.has(id))
        return { ok: false, reason: 'not_found' };
    const { members } = collections();
    if (id === DEFAULT_OUTFIT) {
        await members.updateOne({ guildId, userId }, { $set: { outfit: null } });
    }
    else {
        const worn = await members.updateOne({ guildId, userId, outfits: id }, { $set: { outfit: id } });
        if (worn.matchedCount === 0)
            return { ok: false, reason: 'not_owned' };
    }
    gearChanged(guildId, userId);
    return { ok: true };
}
//# sourceMappingURL=outfits.js.map