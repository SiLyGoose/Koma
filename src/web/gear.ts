import { CONFIG } from '../config.js';
import { collections } from '../db.js';
import { REFINE } from '../constants/index.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { canUseItem, describeEffects, describeTotals, itemEffectiveness, showsMasterwork, totalEffects, type GearPiece } from '../lib/game/items/equipment.js';
import { loadoutCopyIds, loadoutsOf, type LoadoutView } from '../lib/game/items/loadouts.js';
import { refineCopyPlan, refineCost, refineLevel } from '../lib/game/items/refine.js';
import { equippedCopyIds } from '../lib/game/items/sell.js';
import { equipCopy, unequipAll, unequipSlot } from '../services/items/equipment.js';
import { forgeMasterwork } from '../services/items/forge.js';
import { refineItem } from '../services/items/refine.js';
import { switchLoadout } from '../services/items/loadouts.js';
import type { EquipmentDoc, ItemCopyDoc, ItemDef, Slot, Stars } from '../types.js';
import { gearStats, type StatSection } from './stats.js';
import { SLOTS } from '../types.js';

/*
 * The site's gear page (GET /api/gear, POST /api/gear/equip, /unequip, /unequip-all, /loadout, /refine and /forge):
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
  /** Refining it (services/items/refine.ts), for the page's confirmation. */
  refine: GearRefine;
  /** Forging it into a masterwork (services/items/forge.ts), for the page's confirmation: null when its item has no bonus. */
  forge: GearForge | null;
}

/** Refining a copy: what the page asks the member to confirm. */
export interface GearRefine {
  /** Why it can't be done now (null when it can). */
  blocked: RefineBlock | null;
  /** What the next level costs in points (null at the top level). */
  cost: number | null;
  /** The level of the spare copy it would use up when none is picked (null when there's none to use). */
  spare: number | null;
  /** What it would do at the next level, as `effects` (null when it can't go up). */
  after: string[] | null;
}

/**
 * Why a copy can't be refined: it's at the top level, there's no spare copy of it to use up (another
 * copy of its item that isn't worn, saved in a loadout or a masterwork), or they can't pay for it.
 * Every copy is refined as itself on the site, whatever level its item's other copies are at.
 */
export type RefineBlock = 'maxed' | 'no_duplicate' | 'too_poor';

/** Forging a copy into a masterwork: what the page asks the member to confirm. */
export interface GearForge {
  /** Why it can't be done now (null when it can). */
  blocked: ForgeBlock | null;
  /** What it costs in komaGems. */
  cost: number;
  /** The level it has to be refined to first. */
  level: number;
  /** What it would do once forged, as `effects` (null when it's forged already). */
  after: string[] | null;
}

/** Why a copy can't be forged: it's a masterwork already, it isn't refined far enough, or they can't pay for it. */
export type ForgeBlock = 'forged' | 'too_low' | 'too_poor';

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
  /** Their points in the server (null when not known), for what a refine leaves them. */
  balance: number | null;
  /** Their komaGems in the server (null when not known), for what a forge leaves them. */
  gems: number | null;
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
  /**
   * Refines that copy one level, using up `materialId` (null: the lowest-level spare it could use): 'ok',
   * or why not ('not_found' when they don't own it, 'bad_material' when that material can't be used up,
   * 'busy' when their copies changed meanwhile).
   */
  refine: (guildId: string, userId: string, copyId: string, materialId: string | null) => Promise<'ok' | RefineBlock | 'bad_material' | 'not_found' | 'busy'>;
  /** Forges that copy into a masterwork: 'ok', or why not ('not_found' when they don't own it or its item has no bonus). */
  forge: (guildId: string, userId: string, copyId: string) => Promise<'ok' | ForgeBlock | 'not_found' | 'busy'>;
}

type CopyInfo = Pick<ItemCopyDoc, '_id' | 'itemId' | 'level' | 'masterwork'> & Partial<Pick<ItemCopyDoc, 'obtainedAt'>>;

/**
 * Whether refining `copyId` itself can be done, with the member's copies of its item (`sameItem`), the
 * copies they wear or keep in any loadout (`kept`, never used up), and their points (null: not known,
 * never too poor), and the level it would go up to (null when it can't).
 */
function refineState(
  copyId: string,
  sameItem: readonly CopyInfo[],
  stars: Stars,
  kept: ReadonlySet<string>,
  balance: number | null,
): Omit<GearRefine, 'after'> & { to: number | null } {
  const plan = refineCopyPlan(
    sameItem.map((copy) => ({ ...copy, obtainedAt: copy.obtainedAt ?? new Date(0) })),
    copyId,
    null,
    kept,
  );
  if (!plan.ok && (plan.reason === 'not_owned' || plan.reason === 'bad_material')) return { blocked: 'no_duplicate', cost: null, spare: null, to: null };
  const level = plan.ok ? plan.from : plan.level;
  const to = level < REFINE.maxLevel ? level + 1 : null;
  const cost = to === null ? null : refineCost(stars, to);
  if (!plan.ok) return { blocked: plan.reason, cost, spare: null, to: plan.reason === 'maxed' ? null : to };
  const spare = refineLevel(plan.fodder.level);
  if (balance !== null && cost !== null && balance < cost) return { blocked: 'too_poor', cost, spare, to };
  return { blocked: null, cost, spare, to };
}

/** Whether a copy of `item` at `level` can be forged, with their komaGems (null: not known, never too poor); null when `item` has no bonus. */
function forgeState(item: ItemDef, level: number, masterwork: boolean, gems: number | null): Omit<GearForge, 'after'> | null {
  if (!item.bonus) return null;
  const cost = CONFIG.refine.masterworkGems;
  const needed = item.bonus.level;
  const blocked: ForgeBlock | null = masterwork ? 'forged' : level < needed ? 'too_low' : gems !== null && gems < cost ? 'too_poor' : null;
  return { blocked, cost, level: needed };
}

/**
 * The gear page's view of `copies` (all a member owns), with `equipment` what they wear,
 * `loadouts` all their loadouts (by default just the one they're wearing) and `balance` their points
 * (null when not known: no refine is then held back for the price) and `gems` their komaGems (likewise for a forge).
 */
export function gearView(
  copies: readonly CopyInfo[],
  equipment: EquipmentDoc | null | undefined,
  userId: string,
  loadouts: readonly LoadoutView[] = loadoutsOf({ equipment: equipment ?? undefined }),
  balance: number | null = null,
  gems: number | null = null,
): GearView {
  const wornIds = equippedCopyIds(equipment);
  const kept = new Set(wornIds);
  for (const loadout of loadouts) for (const id of equippedCopyIds(loadout.equipment)) kept.add(id);

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
      refine: { blocked: null, cost: null, spare: null, after: null },
      forge: null,
    };
    const { to, ...refine } = refineState(copy._id, copies.filter((other) => other.itemId === copy.itemId), item.stars, kept, balance);
    view.refine = { ...refine, after: to === null ? null : describeEffects(item, share, to, masterwork) };
    const forge = forgeState(item, level, masterwork, gems);
    view.forge = forge && { ...forge, after: masterwork ? null : describeEffects(item, share, Math.max(level, forge.level), true) };
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
    balance,
    gems,
  };
}

export const gearStore: GearStore = {
  view: async (guildId, userId) => {
    const { items, members } = collections();
    const [copies, member] = await Promise.all([items.find({ guildId, userId }).toArray(), members.findOne({ guildId, userId })]);
    return gearView(copies, member?.equipment, userId, loadoutsOf(member), member?.points ?? 0, member?.gems ?? 0);
  },
  equip: async (guildId, userId, copyId) => (await equipCopy(guildId, userId, copyId)).ok,
  unequip: async (guildId, userId, slot) => {
    await unequipSlot(guildId, userId, slot);
  },
  unequipAll: async (guildId, userId) => {
    await unequipAll(guildId, userId);
  },
  switchLoadout: async (guildId, userId, number) => (await switchLoadout(guildId, userId, number)).ok,
  refine: async (guildId, userId, copyId, materialId) => {
    const { items, members } = collections();
    const copy = await items.findOne({ _id: copyId, guildId, userId });
    const item = copy && ITEMS_BY_ID.get(copy.itemId);
    if (!copy || !item) return 'not_found';
    // This copy is the one raised, whatever level its item's other copies are at.
    const [sameItem, member] = await Promise.all([items.find({ guildId, userId, itemId: item.id }).toArray(), members.findOne({ guildId, userId })]);
    const kept = new Set([...equippedCopyIds(member?.equipment), ...loadoutCopyIds(member)]);
    const state = refineState(copyId, sameItem, item.stars, kept, member?.points ?? 0);
    if (state.blocked) return state.blocked;
    const result = await refineItem(guildId, userId, item, { copy: copyId, material: materialId });
    if (result.ok) return 'ok';
    return result.reason === 'not_owned' ? 'not_found' : result.reason;
  },
  forge: async (guildId, userId, copyId) => {
    const copy = await collections().items.findOne({ _id: copyId, guildId, userId });
    const item = copy && ITEMS_BY_ID.get(copy.itemId);
    if (!copy || !item) return 'not_found';
    const result = await forgeMasterwork(guildId, userId, item, copyId);
    if (result.ok) return 'ok';
    if (result.reason === 'already') return 'forged';
    return result.reason === 'not_owned' || result.reason === 'no_bonus' ? 'not_found' : result.reason;
  },
};
