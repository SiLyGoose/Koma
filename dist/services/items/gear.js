import { collections } from '../../db.js';
import { SLOTS } from '../../types.js';
import { refineLevel } from '../../lib/game/items/refine.js';
/**
 * Turns what a member has equipped (copy ids, stored on their member document) into the item
 * ids the effect math works with, and each copy's refinement level. A copy only counts if the member still owns it: the lookup
 * is filtered by owner, so gear that was traded away or deleted can never keep giving effects.
 */
export async function resolveGear(guildId, userId, equipment) {
    const wanted = SLOTS.map((slot) => equipment?.[slot]).filter((id) => typeof id === 'string' && id !== '');
    if (wanted.length === 0)
        return {};
    const copies = await collections().items.find({ guildId, userId, _id: { $in: wanted } }).toArray();
    const gear = { levels: {}, locked: {} };
    for (const slot of SLOTS) {
        const copyId = equipment?.[slot];
        const copy = copies.find((candidate) => candidate._id === copyId);
        if (!copy)
            continue;
        gear[slot] = copy.itemId;
        gear.levels[slot] = refineLevel(copy.level);
        gear.locked[slot] = copy.locked === true;
    }
    return gear;
}
//# sourceMappingURL=gear.js.map