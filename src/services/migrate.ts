import { collections } from '../db.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { bestCopy } from '../lib/game/copies.js';
import type { ItemCopyDoc } from '../types.js';
import { SLOTS } from '../types.js';

/*
 * One-time move from the old inventory (one document per item with a count, in the
 * `inventory` collection) to one document per copy (the `items` collection).
 *
 *   1. Every old stack of N becomes N copies at level 0. Their ids are made from the old
 *      document's id, so running this twice (or after a crash halfway) never duplicates
 *      anything. Each old document is marked with `migratedAt` once its copies exist.
 *   2. Equipped items used to be stored as item ids. They are changed to the id of the
 *      member's best copy of that item (or cleared if they no longer own one).
 *
 * When both steps are done a marker is saved in the `meta` collection, and later starts skip
 * everything. The old `inventory` collection is left in place, untouched apart from the
 * `migratedAt` marks, so nothing is lost; it can be deleted whenever you like.
 */

const MARKER_ID = 'itemCopies';
const BATCH = 500;

export interface MigrationResult {
  skipped: boolean;
  stacks: number;
  copies: number;
  equipped: number;
}

export async function migrateInventory(): Promise<MigrationResult> {
  const { inventory, items, members, meta } = collections();

  if (await meta.findOne({ _id: MARKER_ID })) return { skipped: true, stacks: 0, copies: 0, equipped: 0 };

  // Step 1: old stacks -> copies.
  let stacks = 0;
  let copies = 0;
  const pending = await inventory.find({ migratedAt: null }).toArray();
  for (const stack of pending) {
    const wanted: ItemCopyDoc[] = [];
    const count = Math.max(0, Math.floor(Number(stack.count) || 0));
    for (let i = 0; i < count; i++) {
      wanted.push({
        _id: `legacy-${String(stack._id)}-${i}`,
        guildId: stack.guildId,
        userId: stack.userId,
        itemId: stack.itemId,
        level: 0,
        obtainedAt: stack.firstObtainedAt ?? new Date(),
      });
    }

    for (let start = 0; start < wanted.length; start += BATCH) {
      const chunk = wanted.slice(start, start + BATCH);
      // Skip copies that already exist from an interrupted earlier run.
      const existing = await items.find({ _id: { $in: chunk.map((copy) => copy._id) } }).toArray();
      const have = new Set(existing.map((copy) => copy._id));
      const missing = chunk.filter((copy) => !have.has(copy._id));
      if (missing.length > 0) {
        await items.insertMany(missing);
        copies += missing.length;
      }
    }
    await inventory.updateOne({ _id: stack._id }, { $set: { migratedAt: new Date() } });
    stacks += 1;
  }

  // Step 2: equipped item ids -> copy ids.
  let equipped = 0;
  const wearing = await members.find({ equipment: { $exists: true } }).toArray();
  for (const member of wearing) {
    for (const slot of SLOTS) {
      const stored = member.equipment?.[slot];
      if (!stored) continue;

      const { guildId, userId } = member;
      const alreadyCopy = await items.findOne({ guildId, userId, _id: stored });
      if (alreadyCopy) continue;

      const owned = await items.find({ guildId, userId, itemId: stored }).toArray();
      const copy = bestCopy(owned);
      await members.updateOne({ guildId, userId }, { $set: { [`equipment.${slot}`]: copy?._id ?? null } });
      equipped += 1;
    }
  }

  await meta.updateOne({ _id: MARKER_ID }, { $set: { migratedAt: new Date(), stacks, copies, equipped } }, { upsert: true });
  return { skipped: false, stacks, copies, equipped };
}

/*
 * One-time move for the unique-treasure (UT) refactor: Wheelchair and D20 moved out of their
 * old slot (armor and weapon) into the new 'unique' slot. A member who had one of them
 * equipped before the refactor has its copy id sitting in the wrong equipment field, so this
 * moves it into equipment.unique and clears the old field. Gated by its own marker, separate
 * from the item-copies migration above, so it only ever runs once.
 *
 * The only way a member could have needed two moves at once (a UT item equipped as their
 * weapon AND another as their armor) is the admin, since real unique treasures are each
 * exclusive to one other person. If that happens, the weapon one wins the unique slot and
 * the armor one is unequipped (Claude's call: there is no ordering the user specified, and
 * this is very unlikely to matter for anyone but the admin testing gear).
 */

const UNIQUE_SLOT_MARKER_ID = 'uniqueSlot';

export interface UniqueSlotMigrationResult {
  skipped: boolean;
  moved: number;
  dropped: number;
}

export async function migrateUniqueSlot(): Promise<UniqueSlotMigrationResult> {
  const { items, members, meta } = collections();

  if (await meta.findOne({ _id: UNIQUE_SLOT_MARKER_ID })) return { skipped: true, moved: 0, dropped: 0 };

  let moved = 0;
  let dropped = 0;
  const wearing = await members
    .find({ $or: [{ 'equipment.weapon': { $ne: null } }, { 'equipment.armor': { $ne: null } }] })
    .toArray();
  for (const member of wearing) {
    const { guildId, userId } = member;
    const weaponId = member.equipment?.weapon ?? null;
    const armorId = member.equipment?.armor ?? null;
    if (!weaponId && !armorId) continue;

    const copyIds = [weaponId, armorId].filter((id): id is string => typeof id === 'string' && id !== '');
    const copies = await items.find({ guildId, userId, _id: { $in: copyIds } }).toArray();
    const weaponCopy = weaponId ? copies.find((copy) => copy._id === weaponId) : undefined;
    const armorCopy = armorId ? copies.find((copy) => copy._id === armorId) : undefined;
    const weaponIsUnique = weaponCopy ? ITEMS_BY_ID.get(weaponCopy.itemId)?.slot === 'unique' : false;
    const armorIsUnique = armorCopy ? ITEMS_BY_ID.get(armorCopy.itemId)?.slot === 'unique' : false;
    if (!weaponIsUnique && !armorIsUnique) continue;

    const winnerId = weaponIsUnique ? weaponId : armorId;
    const update: Record<string, unknown> = { 'equipment.unique': winnerId };
    if (weaponIsUnique) update['equipment.weapon'] = null;
    if (armorIsUnique) update['equipment.armor'] = null;
    await members.updateOne({ guildId, userId }, { $set: update });
    moved += 1;
    if (weaponIsUnique && armorIsUnique) dropped += 1;
  }

  await meta.updateOne(
    { _id: UNIQUE_SLOT_MARKER_ID },
    { $set: { migratedAt: new Date(), moved, dropped } },
    { upsert: true },
  );
  return { skipped: false, moved, dropped };
}
