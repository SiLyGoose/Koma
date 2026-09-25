import { collections } from '../db.js';
import type { EquipmentDoc, GearIds, Slot } from '../types.js';
import { SLOTS } from '../types.js';
import { refineLevel } from '../lib/game/refine.js';

/**
 * Turns what a member has equipped (copy ids, stored on their member document) into the item
 * ids the effect math works with, and each copy's refinement level. A copy only counts if the member still owns it: the lookup
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
  const gear: GearIds = { levels: {} };
  for (const slot of SLOTS) {
    const copyId = equipment?.[slot];
    const copy = copies.find((candidate) => candidate._id === copyId);
    if (!copy) continue;
    gear[slot as Slot] = copy.itemId;
    gear.levels![slot as Slot] = refineLevel(copy.level);
  }
  return gear;
}
