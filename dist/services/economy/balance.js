import { CONFIG } from '../../config.js';
import { MINUTE_MS } from '../../constants/index.js';
import { collections } from '../../db.js';
import { groupCopies, stackCopies } from '../../lib/game/items/copies.js';
import { equippedCopyIds } from '../../lib/game/items/sell.js';
import { currentHour, nextHourUnix } from '../../lib/time.js';
import { gearEffects } from '../../lib/game/items/equipment.js';
import { resolveGear } from '../items/gear.js';
import { claimReadyHour, stonksStatus } from './claim.js';
/** The moment a timer that started at `startedAt` runs out (unix seconds), or null if it already has. */
function timerEndsAtUnix(startedAt, lengthMs, now) {
    if (!startedAt)
        return null;
    const endsAt = startedAt.getTime() + lengthMs;
    return endsAt > now ? Math.ceil(endsAt / 1000) : null;
}
export async function getBalance(guildId, userId) {
    const member = await collections().members.findOne({ guildId, userId });
    const now = Date.now();
    const hour = currentHour(now);
    return {
        points: member?.points ?? 0,
        tokens: member?.tokens ?? 0,
        gems: member?.gems ?? 0,
        canClaim: !member || claimReadyHour(member) <= hour,
        // The end of the hour before the one they can claim in (the end of this hour, normally).
        nextClaimUnix: nextHourUnix(Math.max(hour, member ? claimReadyHour(member) - 1 : hour)),
        robReadyAtUnix: timerEndsAtUnix(member?.lastRobAt, CONFIG.rob.cooldownMinutes * MINUTE_MS * (member?.robCooldownScale ?? 1), now),
        withered: member?.claimTaxRate && member.claimTaxBy ? { rate: member.claimTaxRate, byUserId: member.claimTaxBy } : null,
        robTax: member?.robTaxRate && member.robTaxBy ? { rate: member.robTaxRate, byUserId: member.robTaxBy } : null,
    };
}
/** Where a member's STONKS! claim multiplier stands, or null when they aren't wearing it. */
export async function getStonks(guildId, userId) {
    const member = await collections().members.findOne({ guildId, userId });
    if (!member?.equipment)
        return null;
    const gear = gearEffects(await resolveGear(guildId, userId, member.equipment), userId);
    return stonksStatus(member.lastClaimHour, gear, currentHour());
}
/** What a member owns, one entry per kind of item, with how many copies they have. */
export async function getInventory(guildId, userId) {
    const copies = await collections().items.find({ guildId, userId }).toArray();
    return groupCopies(copies);
}
/** A member's copies as the inventory lists them (lib/game/items/copies.ts stackCopies): copies that differ are on lines of their own. */
export async function getInventoryStacks(guildId, userId) {
    const { items, members } = collections();
    const [copies, member] = await Promise.all([items.find({ guildId, userId }).toArray(), members.findOne({ guildId, userId })]);
    return stackCopies(copies, equippedCopyIds(member?.equipment));
}
export async function getLeaderboard(guildId, limit) {
    return collections()
        .members.find({ guildId, points: { $gt: 0 } })
        .sort({ points: -1, createdAt: 1 })
        .limit(limit)
        .toArray();
}
//# sourceMappingURL=balance.js.map