import { collections } from '../../db.js';
import { ITEMS_BY_ID } from '../../data/items.js';
import { bestCopy } from '../../lib/game/items/copies.js';
import { heroOnly } from '../../lib/game/heroes.js';
import { SLOTS } from '../../types.js';
import { ensureMember } from '../economy/index.js';
import { gearChanged } from './gear-events.js';
import { resolveGear } from './gear.js';
import { refineLevel } from '../../lib/game/items/refine.js';
/*
 * What a member has equipped is stored on their member document (per server), as
 * `equipment.weapon` and `equipment.armor`: the id of the specific copy they are wearing (see
 * ItemCopyDoc), not just the item. You can only equip items you own, and equipping something
 * replaces whatever was in that slot. When you equip by item name, the best copy you own is
 * used (highest level, then the oldest).
 */
/** The item ids of what a member has equipped, counting only copies they still own. */
export async function getEquipment(guildId, userId) {
    const member = await collections().members.findOne({ guildId, userId });
    return resolveGear(guildId, userId, member?.equipment);
}
/** Equips the best copy of an item the member owns into its slot. */
export async function equipItem(guildId, userId, item) {
    const { items, members } = collections();
    if (heroOnly(item))
        return { ok: false, reason: 'hero_only' };
    const owned = await items.find({ guildId, userId, itemId: item.id }).toArray();
    const copy = bestCopy(owned);
    if (!copy)
        return { ok: false, reason: 'not_owned' };
    await ensureMember(guildId, userId);
    const before = await members.findOneAndUpdate({ guildId, userId }, { $set: { [`equipment.${item.slot}`]: copy._id } }, { returnDocument: 'before' });
    gearChanged(guildId, userId);
    const previousCopyId = before?.equipment?.[item.slot] ?? null;
    const previous = previousCopyId ? await items.findOne({ guildId, userId, _id: previousCopyId }) : null;
    return {
        ok: true,
        slot: item.slot,
        item,
        previousId: previous?.itemId ?? null,
        alreadyEquipped: previousCopyId === copy._id,
        level: refineLevel(copy.level),
    };
}
/**
 * Equips one specific copy (by its id) into its item's slot, for the site's gear page, which
 * picks copies rather than items. Only a copy the member owns, of an item still in the catalog that
 * isn't only for heroes.
 */
export async function equipCopy(guildId, userId, copyId) {
    const { items, members } = collections();
    const copy = await items.findOne({ guildId, userId, _id: copyId });
    const item = copy ? ITEMS_BY_ID.get(copy.itemId) : undefined;
    if (!copy || !item)
        return { ok: false, reason: 'not_owned' };
    if (heroOnly(item))
        return { ok: false, reason: 'hero_only' };
    await ensureMember(guildId, userId);
    await members.updateOne({ guildId, userId }, { $set: { [`equipment.${item.slot}`]: copy._id } });
    gearChanged(guildId, userId);
    return { ok: true, slot: item.slot };
}
/** Empties a slot. `removedId` is the item that was in it, or null if it was already empty. */
export async function unequipSlot(guildId, userId, slot) {
    const { items, members } = collections();
    const before = await members.findOneAndUpdate({ guildId, userId }, { $set: { [`equipment.${slot}`]: null } }, { returnDocument: 'before' });
    gearChanged(guildId, userId);
    const copyId = before?.equipment?.[slot] ?? null;
    const copy = copyId ? await items.findOne({ guildId, userId, _id: copyId }) : null;
    return { removedId: copy?.itemId ?? null };
}
/** Empties every slot. */
export async function unequipAll(guildId, userId) {
    const { members } = collections();
    await members.updateOne({ guildId, userId }, { $set: Object.fromEntries(SLOTS.map((slot) => [`equipment.${slot}`, null])) });
    gearChanged(guildId, userId);
}
//# sourceMappingURL=equipment.js.map