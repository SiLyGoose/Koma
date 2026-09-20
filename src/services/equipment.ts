import { collections } from '../db.js';
import type { EquipmentDoc, ItemDef, Slot } from '../types.js';
import { ensureMember } from './economy.js';

/*
 * What a member has equipped is stored on their member document (per server), as
 * `equipment.weapon` and `equipment.armor` item ids. You can only equip items you own, and
 * equipping something replaces whatever was in that slot. Owning duplicates doesn't stack:
 * one item per slot, so only the slot matters.
 */

export async function getEquipment(guildId: string, userId: string): Promise<EquipmentDoc> {
  const member = await collections().members.findOne({ guildId, userId });
  return member?.equipment ?? {};
}

export type EquipResult =
  | { ok: true; slot: Slot; item: ItemDef; previousId: string | null }
  | { ok: false; reason: 'not_owned' };

/** Equips an item the member owns into its slot. `previousId` is what it replaced, if anything. */
export async function equipItem(guildId: string, userId: string, item: ItemDef): Promise<EquipResult> {
  const { inventory, members } = collections();

  const owned = await inventory.findOne({ guildId, userId, itemId: item.id });
  if (!owned || owned.count < 1) return { ok: false, reason: 'not_owned' };

  await ensureMember(guildId, userId);
  const before = await members.findOneAndUpdate(
    { guildId, userId },
    { $set: { [`equipment.${item.slot}`]: item.id } },
    { returnDocument: 'before' },
  );
  return { ok: true, slot: item.slot, item, previousId: before?.equipment?.[item.slot] ?? null };
}

/** Empties a slot. `removedId` is what was in it, or null if it was already empty. */
export async function unequipSlot(
  guildId: string,
  userId: string,
  slot: Slot,
): Promise<{ removedId: string | null }> {
  const before = await collections().members.findOneAndUpdate(
    { guildId, userId },
    { $set: { [`equipment.${slot}`]: null } },
    { returnDocument: 'before' },
  );
  return { removedId: before?.equipment?.[slot] ?? null };
}
