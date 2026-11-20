import { CONFIG } from '../config.js';
import { collections } from '../db.js';
import { raidWeek } from '../lib/events/raid-week.js';
import { raidShopStock, refreshPrice, refreshesUsed } from '../lib/game/items/raid-shop.js';
import { addCopy } from './economy/index.js';
import { ensureMember, recordLedger } from './economy/shared.js';
/** Buys the member one copy of raid item `itemId` from their shelf, as it stands at `now`. */
export async function buyRaidItem(guildId, userId, itemId, now = new Date()) {
    const { members } = collections();
    const week = raidWeek(now).key;
    const before = await members.findOne({ guildId, userId }, { projection: { raidShop: 1 } });
    const shelf = raidShopStock(guildId, week, CONFIG.raid.shop, { userId, refreshes: refreshesUsed(before?.raidShop, week) });
    const entry = shelf.find((e) => e.item.id === itemId);
    if (!entry)
        return { ok: false, reason: 'not_found' };
    const { item, price } = entry;
    await ensureMember(guildId, userId);
    const charged = await members.findOneAndUpdate({ guildId, userId, ...(price > 0 ? { gems: { $gte: price } } : {}) }, { $inc: { gems: -price } }, { returnDocument: 'after' });
    if (!charged) {
        const member = await members.findOne({ guildId, userId });
        return { ok: false, reason: 'too_poor', price, gems: member?.gems ?? 0 };
    }
    let count;
    try {
        ({ count } = await addCopy(guildId, userId, item.id));
    }
    catch (err) {
        await members.updateOne({ guildId, userId }, { $inc: { gems: price } });
        throw err;
    }
    if (price > 0)
        await recordLedger([{ guildId, userId, delta: 0, gemDelta: -price, reason: 'raid_shop', itemId: item.id }]);
    return { ok: true, item, paid: price, gemsLeft: charged.gems ?? 0, count };
}
/** Pays for a new shelf for the member (their next refresh of the week at `now`). */
export async function refreshRaidShop(guildId, userId, now = new Date()) {
    const { members } = collections();
    const week = raidWeek(now).key;
    await ensureMember(guildId, userId);
    const member = await members.findOne({ guildId, userId });
    const used = refreshesUsed(member?.raidShop, week);
    const price = refreshPrice(used, CONFIG.raid.shop);
    if (price === null)
        return { ok: false, reason: 'no_refreshes' };
    const gems = member?.gems ?? 0;
    if (gems < price)
        return { ok: false, reason: 'too_poor', price, gems };
    // Only while what's kept on them is still what the price came from (nothing kept, or that week and count).
    const kept = member?.raidShop;
    const charged = await members.findOneAndUpdate({
        guildId,
        userId,
        ...(price > 0 ? { gems: { $gte: price } } : {}),
        ...(kept ? { 'raidShop.week': kept.week, 'raidShop.refreshes': kept.refreshes } : { raidShop: { $exists: false } }),
    }, { $inc: { gems: -price }, $set: { raidShop: { week, refreshes: used + 1 } } }, { returnDocument: 'after' });
    if (!charged)
        return { ok: false, reason: 'busy' };
    if (price > 0)
        await recordLedger([{ guildId, userId, delta: 0, gemDelta: -price, reason: 'raid_shop_refresh' }]);
    return { ok: true, paid: price, gemsLeft: charged.gems ?? 0, refreshes: used + 1 };
}
//# sourceMappingURL=raid-shop.js.map