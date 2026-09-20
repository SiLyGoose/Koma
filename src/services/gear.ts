import { collections } from '../db.js';
import type { EquipmentDoc, GearIds, Slot } from '../types.js';
import { SLOTS } from '../types.js';

/**
 * Turns what a member has equipped (copy ids, stored on their member document) into the item
 * ids the effect math works with. A copy only counts if the member still owns it: the lookup
 * is filtered by owner, so gear that was traded away or deleted can never keep giving effects.
 */
export async function resolveGear(
  guildId: string,
  userId: string,
  equipment: EquipmentDoc | null | undefined,
): Promise<GearIds> {
  const wanted = SLOTS.map((slot) => equipment?.[slot]).filter((id): id is string => typeof id === 'string' && id !== '');
  if (wanted.length === 0) return {};

  const copies = await collections().items.find({ guildId, userId, _id: { $in: wanted } }).toArray();
  const gear: GearIds = {};
  for (const slot of SLOTS) {
    const copyId = equipment?.[slot];
    const copy = copies.find((candidate) => candidate._id === copyId);
    if (copy) gear[slot as Slot] = copy.itemId;
  }
  return gear;
}
