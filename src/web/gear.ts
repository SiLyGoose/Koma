import { collections } from '../db.js';
import { REFINE } from '../constants/index.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { canUseItem, describeEffects, describeTotals, itemEffectiveness, showsMasterwork, totalEffects, type GearPiece } from '../lib/game/items/equipment.js';
import { loadoutsOf, type LoadoutView } from '../lib/game/items/loadouts.js';
import { refineLevel } from '../lib/game/items/refine.js';
import { equipCopy, unequipAll, unequipSlot } from '../services/items/equipment.js';
import { switchLoadout } from '../services/items/loadouts.js';
import type { EquipmentDoc, ItemCopyDoc, Slot, Stars } from '../types.js';
import { gearStats, type StatSection } from './stats.js';
import { SLOTS } from '../types.js';

/*
 * The site's gear page (GET /api/gear, POST /api/gear/equip, /unequip, /unequip-all and /loadout):
 * every copy a member owns, what each one does at its level, which copy sits in each slot, and their
 * loadouts. The effect lines
 * are the gear card's, as Discord shows them (custom emoji codes and *italics* included); the page
 * draws those itself.
 */

/** One copy a member owns, as the gear page shows it. */
export interface GearCopy {
  /** The copy's id (ItemCopyDoc._id): what the page equips. */
  id: string;
  itemId: string;
  name: string;
  stars: Stars;
  slot: Slot;
  description: string;
  level: number;
  maxLevel: number;
  /** A masterwork with its bonus on (the gear card's ✨ Masterwork tag). */
  masterwork: boolean;
  /** What it does for this member at this level. */
  effects: string[];
  /** Someone else's exclusive item: the share of its effects this member gets (null when it's theirs to use). */
  borrowed: number | null;
}

/** GET /api/gear: a member's gear. */
export interface GearView {
  /** The copy id in each slot, or null when it's empty. */
  equipped: Record<Slot, string | null>;
  /** Everything they own, best first (stars, then level, then name). */
  copies: GearCopy[];
  /** What everything equipped adds up to. */
  totals: string[];
  /** Their loadouts, in order: the active one is what they're wearing. */
  loadouts: GearLoadout[];
  /** Every number their gear can change, with and without it (the page's Common tab), raid last. */
  stats: StatSection[];
}

/** One of a member's loadouts, as the gear page shows it. */
export interface GearLoadout {
  number: number;
  name: string;
  active: boolean;
  /** The copy id in each slot (only copies they still own, in the slot they fit), or null. */
  equipped: Record<Slot, string | null>;
}

/** What the gear routes use (the database's, unless a test says otherwise). */
export interface GearStore {
  view: (guildId: string, userId: string) => Promise<GearView>;
  /** False when the member doesn't own that copy. */
  equip: (guildId: string, userId: string, copyId: string) => Promise<boolean>;
  unequip: (guildId: string, userId: string, slot: Slot) => Promise<void>;
  unequipAll: (guildId: string, userId: string) => Promise<void>;
  /** False when their loadouts kept changing while switching (nothing changed). */
  switchLoadout: (guildId: string, userId: string, number: number) => Promise<boolean>;
}

type CopyInfo = Pick<ItemCopyDoc, '_id' | 'itemId' | 'level' | 'masterwork'>;

/**
 * The gear page's view of `copies` (all a member owns), with `equipment` what they wear and
 * `loadouts` all their loadouts (by default just the one they're wearing).
 */
export function gearView(
  copies: readonly CopyInfo[],
  equipment: EquipmentDoc | null | undefined,
  userId: string,
  loadouts: readonly LoadoutView[] = loadoutsOf({ equipment: equipment ?? undefined }),
): GearView {
  const list: GearCopy[] = [];
  /** Each copy's view, with its item and whether it was forged (its bonus may not be on yet). */
  const byId = new Map<string, { view: GearCopy; piece: GearPiece }>();
  for (const copy of copies) {
    const item = ITEMS_BY_ID.get(copy.itemId);
    if (!item) continue;
    const level = refineLevel(copy.level);
    const masterwork = copy.masterwork === true;
    const share = itemEffectiveness(item, userId);
    const view: GearCopy = {
      id: copy._id,
      itemId: item.id,
      name: item.name,
      stars: item.stars,
      slot: item.slot,
      description: item.description,
      level,
      maxLevel: REFINE.maxLevel,
      masterwork: showsMasterwork(item, level, masterwork),
      effects: describeEffects(item, share, level, masterwork),
      borrowed: canUseItem(item, userId) ? null : share,
    };
    list.push(view);
    byId.set(view.id, { view, piece: { item, level, bonus: masterwork } });
  }
  list.sort((a, b) => b.stars - a.stars || b.level - a.level || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  /** The copy id in each slot of `gear`, counting only owned copies that fit there. */
  const fitting = (gear: EquipmentDoc | null | undefined): Record<Slot, string | null> => {
    const out = {} as Record<Slot, string | null>;
    for (const slot of SLOTS) {
      const copy = byId.get(gear?.[slot] ?? '');
      out[slot] = copy !== undefined && copy.view.slot === slot ? copy.view.id : null;
    }
    return out;
  };

  const equipped = fitting(equipment);
  const worn = SLOTS.flatMap((slot) => {
    const copy = byId.get(equipped[slot] ?? '');
    return copy ? [copy.piece] : [];
  });
  const totals = totalEffects(worn, userId);
  return {
    equipped,
    copies: list,
    totals: describeTotals(totals),
    stats: gearStats(totals),
    loadouts: loadouts.map((loadout) => ({
      number: loadout.number,
      name: loadout.name,
      active: loadout.active,
      equipped: loadout.active ? equipped : fitting(loadout.equipment),
    })),
  };
}

export const gearStore: GearStore = {
  view: async (guildId, userId) => {
    const { items, members } = collections();
    const [copies, member] = await Promise.all([items.find({ guildId, userId }).toArray(), members.findOne({ guildId, userId })]);
    return gearView(copies, member?.equipment, userId, loadoutsOf(member));
  },
  equip: async (guildId, userId, copyId) => (await equipCopy(guildId, userId, copyId)).ok,
  unequip: async (guildId, userId, slot) => {
    await unequipSlot(guildId, userId, slot);
  },
  unequipAll: async (guildId, userId) => {
    await unequipAll(guildId, userId);
  },
  switchLoadout: async (guildId, userId, number) => (await switchLoadout(guildId, userId, number)).ok,
};
