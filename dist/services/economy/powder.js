import { CONFIG } from '../../config.js';
import { collections } from '../../db.js';
import { rollUtOptions } from '../../lib/game/technomagic.js';
import { selectorItem } from '../mail.js';
import { addCopy } from './gacha.js';
import { ensureMember, recordLedger } from './shared.js';
/** Crafts `count` komaGems from the member's komaDust, all at once or none (too little: 'too_poor'). Returns their balances after. */
export async function craftGems(guildId, userId, count) {
    if (!Number.isInteger(count) || count < 1)
        return { ok: false, reason: 'bad_count' };
    const cost = Math.max(1, Math.floor(CONFIG.sell.powderPerGem)) * count;
    await ensureMember(guildId, userId);
    const after = await collections().members.findOneAndUpdate({ guildId, userId, powder: { $gte: cost } }, { $inc: { powder: -cost, gems: count } }, { returnDocument: 'after' });
    if (!after)
        return { ok: false, reason: 'too_poor' };
    await recordLedger([{ guildId, userId, delta: 0, powderDelta: -cost, gemDelta: count, reason: 'craft_gems' }]);
    return { ok: true, gems: after.gems ?? count, powder: after.powder ?? 0 };
}
/** The tickets a member holds, of each kind (missing: none). */
export const heldSelectors = (held) => ({ uw: held?.uw ?? 0, ut: held?.ut ?? 0 });
/** Crafts `count` tickets of kind `of` from the member's komaDust, all at once or none (too little: 'too_poor'). Their balances after. */
export async function craftSelectors(guildId, userId, of, count) {
    if (!Number.isInteger(count) || count < 1)
        return { ok: false, reason: 'bad_count' };
    const cost = Math.max(1, Math.floor(CONFIG.sell.powderPerSelector)) * count;
    await ensureMember(guildId, userId);
    const after = await collections().members.findOneAndUpdate({ guildId, userId, powder: { $gte: cost } }, { $inc: { powder: -cost, [`selectors.${of}`]: count } }, { returnDocument: 'after' });
    if (!after)
        return { ok: false, reason: 'too_poor' };
    await recordLedger([{ guildId, userId, delta: 0, powderDelta: -cost, itemId: `${of}-selector`, reason: 'craft_selector' }]);
    return { ok: true, powder: after.powder ?? 0, selectors: heldSelectors(after.selectors) };
}
/** Uses one of the member's tickets of kind `of`: the unique weapon or treasure `pick` is, given them (a new copy). Its name. */
export async function useSelector(guildId, userId, of, pick) {
    const item = selectorItem(of, pick);
    if (!item)
        return { ok: false, reason: 'bad_pick' };
    const used = await collections().members.updateOne({ guildId, userId, [`selectors.${of}`]: { $gte: 1 } }, { $inc: { [`selectors.${of}`]: -1 } });
    if (used.modifiedCount === 0)
        return { ok: false, reason: 'not_owned' };
    await addCopy(guildId, userId, item.id, { ...(item.uniqueTreasure && { tmPotentials: rollUtOptions() }) });
    return { ok: true, given: item.name };
}
//# sourceMappingURL=powder.js.map