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
 * Keeps unique-treasure items in the right equipment field. Unlike the marker-gated migration
 * above, this is NOT gated to run once: it is cheap and fully idempotent, and it has to be
 * repeatable, because the treasure list keeps growing as items in the catalog get turned into
 * unique treasures (this happened once already: Wheelchair and D20 moved first, then C4, Frog,
 * Sid the Sloth and Coughing Baby followed later, after some members already had them equipped
 * as their weapon or armor). It does two things, every start:
 *
 *   1. Field rename: the treasure slot used to be stored as `equipment.unique` (from the
 *      original refactor). Any member still holding that old field name gets it renamed to
 *      `equipment.treasure` in one atomic $rename.
 *   2. Stale slot: an item's catalog `slot` can change after members already have it equipped.
 *      `equippedItems()` (lib/game/equipment.ts) only counts a copy that sits in the field
 *      matching its *current* catalog slot, so a copy left behind in the wrong field gives its
 *      wearer nothing and shows as a broken/unknown slot in `k!gear`. This step finds any
 *      weapon/armor copy whose current catalog slot is 'treasure' and reconciles it: moves it
 *      into the treasure slot if that slot is empty, or -- if the member is already wearing a
 *      different treasure item -- just clears it from weapon/armor, since it wasn't doing
 *      anything there anyway.
 *
 * The only way a member could need the move step for two items at once (a treasure item
 * equipped as their weapon AND another as their armor, with the treasure slot itself still
 * empty) is the admin, since real unique treasures are each exclusive to one other person. If
 * that happens, the weapon one wins the treasure slot and the armor one is unequipped (same
 * tie-break the original one-time migration used).
 */

export interface TreasureSlotSyncResult {
  renamed: number;
  moved: number;
  cleared: number;
  dropped: number;
}

export async function syncTreasureSlot(): Promise<TreasureSlotSyncResult> {
  const { items, members } = collections();

  // Step 1: equipment.unique -> equipment.treasure (the old field name from before the rename).
  const renameResult = await members.updateMany(
    { 'equipment.unique': { $exists: true } },
    { $rename: { 'equipment.unique': 'equipment.treasure' } },
  );
  const renamed = renameResult.modifiedCount;

  // Step 2: a treasure item stuck in weapon or armor (the catalog changed after it was equipped).
  let moved = 0;
  let cleared = 0;
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
    const weaponIsTreasure = weaponCopy ? ITEMS_BY_ID.get(weaponCopy.itemId)?.slot === 'treasure' : false;
    const armorIsTreasure = armorCopy ? ITEMS_BY_ID.get(armorCopy.itemId)?.slot === 'treasure' : false;
    if (!weaponIsTreasure && !armorIsTreasure) continue;

    const currentTreasureId = member.equipment?.treasure ?? null;
    const update: Record<string, unknown> = {};
    if (currentTreasureId) {
      // Already wearing a (different) treasure item: the stale one wasn't doing anything, just clear it.
      if (weaponIsTreasure) update['equipment.weapon'] = null;
      if (armorIsTreasure) update['equipment.armor'] = null;
      cleared += 1;
    } else {
      const winnerId = weaponIsTreasure ? weaponId : armorId;
      update['equipment.treasure'] = winnerId;
      if (weaponIsTreasure) update['equipment.weapon'] = null;
      if (armorIsTreasure) update['equipment.armor'] = null;
      moved += 1;
      if (weaponIsTreasure && armorIsTreasure) dropped += 1;
    }
    await members.updateOne({ guildId, userId }, { $set: update });
  }

  return { renamed, moved, cleared, dropped };
}

/*
 * Field rename: a server's one dedicated channel used to be stored as `eventChannelId`, back
 * when it only chose where random events happened; it's now `channelId` (see services/channel.ts
 * and types.ts's GuildDoc), since commands are confined to it too. Cheap, fully idempotent (a
 * $rename on a document that doesn't have the old field is a no-op), so like syncTreasureSlot
 * above this runs every start instead of being gated behind a one-time marker.
 */
export async function renameEventChannelField(): Promise<number> {
  const { guilds } = collections();
  const result = await guilds.updateMany({ eventChannelId: { $exists: true } }, { $rename: { eventChannelId: 'channelId' } });
  return result.modifiedCount;
}

/*
 * The vault breaker event was replaced by Greedy Heist and Split or Steal, which don't save
 * themselves. A vault breaker left open when the bot last stopped is just cleared: it only moved
 * points once it settled, so dropping it takes nothing from anyone. Idempotent, runs every start.
 */
export async function clearOpenVaults(): Promise<number> {
  const { guilds } = collections();
  const result = await guilds.updateMany({ openVault: { $exists: true } }, { $unset: { openVault: '' } });
  return result.modifiedCount;
}
