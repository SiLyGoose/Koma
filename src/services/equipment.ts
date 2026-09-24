import { collections } from '../db.js';
import { bestCopy } from '../lib/game/copies.js';
import type { GearIds, ItemDef, Slot } from '../types.js';
import { ensureMember } from './economy/index.js';
import { resolveGear } from './gear.js';

/*
 * What a member has equipped is stored on their member document (per server), as
 * `equipment.weapon` and `equipment.armor`: the id of the specific copy they are wearing (see
 * ItemCopyDoc), not just the item. You can only equip items you own, and equipping something
 * replaces whatever was in that slot. When you equip by item name, the best copy you own is
 * used (highest level, then the oldest).
 */

/** The item ids of what a member has equipped, counting only copies they still own. */
export async function getEquipment(guildId: string, userId: string): Promise<GearIds> {
  const member = await collections().members.findOne({ guildId, userId });
  return resolveGear(guildId, userId, member?.equipment);
}

export type EquipResult =
  | {
      ok: true;
      slot: Slot;
      item: ItemDef;
      /** The item that was in the slot before (null if it was empty). */
      previousId: string | null;
      /** True if this exact copy was already equipped, so nothing changed. */
      alreadyEquipped: boolean;
    }
  | { ok: false; reason: 'not_owned' };

/** Equips the best copy of an item the member owns into its slot. */
export async function equipItem(guildId: string, userId: string, item: ItemDef): Promise<EquipResult> {
  const { items, members } = collections();

  const owned = await items.find({ guildId, userId, itemId: item.id }).toArray();
  const copy = bestCopy(owned);
  if (!copy) return { ok: false, reason: 'not_owned' };

  await ensureMember(guildId, userId);
  const before = await members.findOneAndUpdate(
    { guildId, userId },
    { $set: { [`equipment.${item.slot}`]: copy._id } },
    { returnDocument: 'before' },
  );

  const previousCopyId = before?.equipment?.[item.slot] ?? null;
  const previous = previousCopyId ? await items.findOne({ guildId, userId, _id: previousCopyId }) : null;
  return {
    ok: true,
    slot: item.slot,
    item,
    previousId: previous?.itemId ?? null,
    alreadyEquipped: previousCopyId === copy._id,
  };
}

/** Empties a slot. `removedId` is the item that was in it, or null if it was already empty. */
export async function unequipSlot(
  guildId: string,
  userId: string,
  slot: Slot,
): Promise<{ removedId: string | null }> {
  const { items, members } = collections();
  const before = await members.findOneAndUpdate(
    { guildId, userId },
    { $set: { [`equipment.${slot}`]: null } },
    { returnDocument: 'before' },
  );
  const copyId = before?.equipment?.[slot] ?? null;
  const copy = copyId ? await items.findOne({ guildId, userId, _id: copyId }) : null;
  return { removedId: copy?.itemId ?? null };
}
