import { CONFIG } from '../../config.js';
import { collections } from '../../db.js';
import { REFINE } from '../../constants/index.js';
import { ITEMS_BY_ID } from '../../data/items.js';
import { DEFAULT_OUTFIT } from '../../data/outfits.js';
import { canUseItem, describeEffects, describeTotals, itemEffectiveness, showsMasterwork, totalEffects, type GearPiece } from '../../lib/game/items/equipment.js';
import { keptCopyIds, loadoutsOf, type LoadoutView, type NameCheck } from '../../lib/game/items/loadouts.js';
import { activeTmEffects, heroOnly, heroWorn, type TmEffectsOn } from '../../lib/game/heroes.js';
import { tmSkillLine } from '../../lib/game/technomagic.js';
import { HEROES_BY_ID } from '../../data/heroes.js';
import { TM_SET_PIECES, tmSetEffect } from '../../data/tm-sets.js';
import { refineCopyPlan, refineCost, refineLevel } from '../../lib/game/items/refine.js';
import { equippedCopyIds, saleCount, sellPrice } from '../../lib/game/items/sell.js';
import { equipCopy, unequipAll, unequipSlot } from '../../services/items/equipment.js';
import { forgeMasterwork } from '../../services/items/forge.js';
import { setCopyLocked } from '../../services/items/lock.js';
import { refineItem } from '../../services/items/refine.js';
import { sellCopies } from '../../services/items/sell.js';
import { wornOutfit } from '../../services/outfits.js';
import { raidClassesOf, raidClassOf, setRaidClass } from '../../services/raid-class.js';
import { classTraits } from '../../lib/game/raid-classes.js';
import { RAID_CLASS_IDS, TEXT, type RaidClassId } from '../../constants/index.js';
import { renameLoadout, switchLoadout } from '../../services/items/loadouts.js';
import type { EquipmentDoc, ItemCopyDoc, ItemDef, MemberDoc, Slot, Stars } from '../../types.js';
import { gearStats, type StatSection } from './stats.js';
import { SLOTS } from '../../types.js';

/*
 * The site's gear page (GET /api/gear and /api/gear/members, POST /api/gear/equip, /unequip, /unequip-all, /loadout, /loadout/rename, /refine, /forge, /sell and /lock):
 * every copy a member owns, what each one does at its level, which copy sits in each slot, and their
 * loadouts; and, to look at, the same for anyone else in the server with gear. The effect lines
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
  /**
   * TechnoMagic gear (not a treasure): its set's effect for its class, once a hero wears `pieces` of it (data/tm-sets.ts),
   * and whether it is on (the hero wearing it has its set's effect); null otherwise.
   */
  setEffect: { pieces: number; text: string; active: boolean } | null;
  /** TechnoMagic gear: the additional skill this copy came with, like "Vigor: Increases DMG…" (null: none). */
  additional: string | null;
  /** Whether its additional skill is on: a hero of its class wears it. */
  additionalActive: boolean;
  /** Worn by a hero of a class it doesn't work on: none of it counts there, not even its stats (the page greys them out). */
  wrongClass: boolean;
  /** Someone else's exclusive item: the share of its effects this member gets (null when it's theirs to use). */
  borrowed: number | null;
  /** Refining it (services/items/refine.ts), for the page's confirmation. */
  refine: GearRefine;
  /** Forging it into a masterwork (services/items/forge.ts), for the page's confirmation: null when its item has no bonus. */
  forge: GearForge | null;
  /** Locked by the member (services/items/lock.ts): never sold or used up by a refine. */
  locked: boolean;
  /** What selling it pays in points (services/items/sell.ts): null when it's worn, saved in a loadout, on a hero or locked, so never sold. */
  sell: number | null;
  /** TechnoMagic gear or a unique weapon: only heroes wear it (the heroes page), never the member. */
  heroOnly: boolean;
  /** A unique weapon: the id of the one hero that wields it (null: not one). */
  uniqueWeapon: string | null;
  /** A class item (raid gear, and all TechnoMagic gear): the class it works for (null: any). */
  itemClass: RaidClassId | null;
  /** The name of the TechnoMagic hero wearing it (the heroes page), or null when none is. */
  hero: string | null;
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
 * copy of its item that isn't worn, saved in a loadout, a masterwork or locked), or they can't pay for it.
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
  /** The outfit they wear (data/outfits.ts): the character the page draws them as. */
  outfit: string;
  /** Their raid class (services/raid-class.ts), or null with none: the page's class ribbon shows and changes it. */
  class: RaidClassId | null;
  /** Every raid class, for the ribbon's picker: its name and what it does in a fight, a line of Discord markdown each. */
  classes: { id: RaidClassId; name: string; traits: string[] }[];
}

/**
 * A raider's gear as they fought (the raid's end screen shows it): only what they wore, in the loadout
 * they wore it in, and none of their money.
 */
export function wornGear(view: GearView): GearView {
  const worn = new Set(Object.values(view.equipped).filter((id): id is string => id !== null));
  return {
    ...view,
    copies: view.copies.filter((copy) => worn.has(copy.id)),
    loadouts: view.loadouts.filter((loadout) => loadout.active),
    balance: null,
    gems: null,
  };
}

/** One of a member's loadouts, as the gear page shows it. */
export interface GearLoadout {
  number: number;
  name: string;
  active: boolean;
  /** The copy id in each slot (only copies they still own, in the slot they fit), or null. */
  equipped: Record<Slot, string | null>;
}

/**
 * Why a loadout can't take a name (lib/game/items/loadouts.ts's checkLoadoutName): it's too long, has
 * characters a name can't, has no letter, is a word the loadout command uses, or is another of their loadouts'.
 */
export type LoadoutNameBlock = `name_${Extract<NameCheck, { ok: false }>['reason']}`;

/** What the gear routes use (the database's, unless a test says otherwise). */
export interface GearStore {
  view: (guildId: string, userId: string) => Promise<GearView>;
  /** Someone else's gear, to look at: without their points or komaGems (so no refine or forge is held back for the price). */
  peek: (guildId: string, userId: string) => Promise<GearView>;
  /** Who in the server owns any gear, and how many copies, most first (at most `limit`). */
  owners: (guildId: string, limit: number) => Promise<{ userId: string; copies: number }[]>;
  /** False when the member doesn't own that copy. */
  equip: (guildId: string, userId: string, copyId: string) => Promise<boolean>;
  unequip: (guildId: string, userId: string, slot: Slot) => Promise<void>;
  unequipAll: (guildId: string, userId: string) => Promise<void>;
  /** False when their loadouts kept changing while switching (nothing changed). */
  switchLoadout: (guildId: string, userId: string, number: number) => Promise<boolean>;
  /** Names loadout `number` (an empty name: its default one again): 'ok', or why it can't have that name. */
  renameLoadout: (guildId: string, userId: string, number: number, name: string) => Promise<'ok' | LoadoutNameBlock>;
  /**
   * Refines that copy one level, using up `materialId` (null: the lowest-level spare it could use): 'ok',
   * or why not ('not_found' when they don't own it, 'bad_material' when that material can't be used up,
   * 'busy' when their copies changed meanwhile).
   */
  refine: (guildId: string, userId: string, copyId: string, materialId: string | null) => Promise<'ok' | RefineBlock | 'bad_material' | 'not_found' | 'busy'>;
  /** Forges that copy into a masterwork: 'ok', or why not ('not_found' when they don't own it or its item has no bonus). */
  forge: (guildId: string, userId: string, copyId: string) => Promise<'ok' | ForgeBlock | 'not_found' | 'busy'>;
  /**
   * Sells those copies (the ones still theirs and not worn or in a loadout): how many were sold and for how many
   * points, or 'nothing_to_sell' when none of them could be.
   */
  sell: (guildId: string, userId: string, copyIds: readonly string[]) => Promise<GearSale | 'nothing_to_sell'>;
  /** Locks or unlocks that copy: false when they don't own it. */
  lock: (guildId: string, userId: string, copyId: string, locked: boolean) => Promise<boolean>;
  /** Sets their raid class (null: none). */
  setClass: (guildId: string, userId: string, id: RaidClassId | null) => Promise<void>;
  /** Each of those members' raid classes, in their order (the roster's badges). */
  classes: (guildId: string, userIds: readonly string[]) => Promise<(RaidClassId | null)[]>;
}

/** What a sale from the gear page sold (POST /api/gear/sell answers the GearView with it). */
export interface GearSale {
  count: number;
  earned: number;
}

type CopyInfo = Pick<ItemCopyDoc, '_id' | 'itemId' | 'level' | 'masterwork' | 'locked'> & Partial<Pick<ItemCopyDoc, 'obtainedAt' | 'tmSkill'>>;

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
 * (null when not known: no refine is then held back for the price) and `gems` their komaGems (likewise for a forge),
 * `outfit` the outfit they wear, `raidClass` their raid class, `heroWorn` the copies their heroes wear
 * (each with the hero's name) and `tmOn` which of their TechnoMagic copies' effects are on (activeTmEffects).
 */
export function gearView(
  copies: readonly CopyInfo[],
  equipment: EquipmentDoc | null | undefined,
  userId: string,
  loadouts: readonly LoadoutView[] = loadoutsOf({ equipment: equipment ?? undefined }),
  balance: number | null = null,
  gems: number | null = null,
  outfit: string = DEFAULT_OUTFIT,
  raidClass: RaidClassId | null = null,
  heroWorn: ReadonlyMap<string, string> = new Map(),
  tmOn: ReadonlyMap<string, TmEffectsOn> = new Map(),
): GearView {
  const wornIds = equippedCopyIds(equipment);
  const kept = new Set([...wornIds, ...heroWorn.keys()]);
  for (const loadout of loadouts) for (const id of equippedCopyIds(loadout.equipment)) kept.add(id);

  const list: GearCopy[] = [];
  /** Each copy's view, with its item and whether it was forged (its bonus may not be on yet). */
  const byId = new Map<string, { view: GearCopy; piece: GearPiece }>();
  for (const copy of copies) {
    const item = ITEMS_BY_ID.get(copy.itemId);
    if (!item) continue;
    const level = refineLevel(copy.level);
    const masterwork = copy.masterwork === true;
    const locked = copy.locked === true;
    const share = itemEffectiveness(item, userId);
    const setEffect = tmSetEffect(item);
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
      setEffect: setEffect === null ? null : { pieces: TM_SET_PIECES, text: setEffect, active: tmOn.get(copy._id)?.set ?? false },
      additional: item.tmDrop ? tmSkillLine(copy.tmSkill) : null,
      additionalActive: tmOn.get(copy._id)?.additional ?? false,
      wrongClass: tmOn.get(copy._id)?.works === false,
      borrowed: canUseItem(item, userId) ? null : share,
      refine: { blocked: null, cost: null, spare: null, after: null },
      forge: null,
      locked,
      sell: kept.has(copy._id) || locked ? null : sellPrice(item.stars),
      heroOnly: heroOnly(item),
      uniqueWeapon: item.uniqueWeapon ?? null,
      itemClass: item.class ?? null,
      hero: heroWorn.get(copy._id) ?? null,
    };
    const { to, ...refine } = refineState(copy._id, copies.filter((other) => other.itemId === copy.itemId), item.stars, kept, balance);
    view.refine = { ...refine, after: to === null ? null : describeEffects(item, share, to, masterwork) };
    const forge = forgeState(item, level, masterwork, gems);
    view.forge = forge && { ...forge, after: masterwork ? null : describeEffects(item, share, Math.max(level, forge.level), true) };
    list.push(view);
    byId.set(view.id, { view, piece: { item, level, bonus: masterwork } });
  }
  // Best first: TechnoMagic gear (a tier of its own, above 4 stars), the unique weapons (between it and 4 stars), then by stars.
  const tier = (copy: GearCopy): number => (copy.uniqueWeapon !== null ? 4.5 : copy.heroOnly ? 5 : copy.stars);
  list.sort((a, b) => tier(b) - tier(a) || b.level - a.level || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

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
    stats: gearStats(totals, raidClass),
    loadouts: loadouts.map((loadout) => ({
      number: loadout.number,
      name: loadout.name,
      active: loadout.active,
      equipped: loadout.active ? equipped : fitting(loadout.equipment),
    })),
    balance,
    gems,
    outfit,
    class: raidClass,
    classes: RAID_CLASS_IDS.map((id) => ({ id, name: TEXT.raid.classes[id].name, traits: classTraits(id) })),
  };
}

/** The copies the member's heroes wear, each with the hero's name. */
const heroNames = (member: Pick<MemberDoc, 'heroes'> | null): Map<string, string> =>
  new Map(
    [...heroWorn(member)].flatMap(([copyId, heroId]) => {
      const hero = HEROES_BY_ID.get(heroId);
      return hero ? [[copyId, hero.name] as const] : [];
    }),
  );

export const gearStore: GearStore = {
  view: async (guildId, userId) => {
    const { items, members } = collections();
    const [copies, member] = await Promise.all([items.find({ guildId, userId }).toArray(), members.findOne({ guildId, userId })]);
    return gearView(copies, member?.equipment, userId, loadoutsOf(member), member?.points ?? 0, member?.gems ?? 0, wornOutfit(member), raidClassOf(member), heroNames(member), activeTmEffects(copies, member));
  },
  peek: async (guildId, userId) => {
    const { items, members } = collections();
    const [copies, member] = await Promise.all([items.find({ guildId, userId }).toArray(), members.findOne({ guildId, userId })]);
    return gearView(copies, member?.equipment, userId, loadoutsOf(member), null, null, wornOutfit(member), raidClassOf(member), heroNames(member), activeTmEffects(copies, member));
  },
  owners: async (guildId, limit) => {
    const rows = await collections()
      .items.aggregate<{ _id: string; copies: number }>([
        { $match: { guildId } },
        { $group: { _id: '$userId', copies: { $sum: 1 } } },
        { $sort: { copies: -1, _id: 1 } },
        { $limit: limit },
      ])
      .toArray();
    return rows.map((row) => ({ userId: row._id, copies: row.copies }));
  },
  equip: async (guildId, userId, copyId) => (await equipCopy(guildId, userId, copyId)).ok,
  unequip: async (guildId, userId, slot) => {
    await unequipSlot(guildId, userId, slot);
  },
  unequipAll: async (guildId, userId) => {
    await unequipAll(guildId, userId);
  },
  switchLoadout: async (guildId, userId, number) => (await switchLoadout(guildId, userId, number)).ok,
  renameLoadout: async (guildId, userId, number, name) => {
    const result = await renameLoadout(guildId, userId, number, name);
    return result.ok ? 'ok' : `name_${result.reason}`;
  },
  refine: async (guildId, userId, copyId, materialId) => {
    const { items, members } = collections();
    const copy = await items.findOne({ _id: copyId, guildId, userId });
    const item = copy && ITEMS_BY_ID.get(copy.itemId);
    if (!copy || !item) return 'not_found';
    // This copy is the one raised, whatever level its item's other copies are at.
    const [sameItem, member] = await Promise.all([items.find({ guildId, userId, itemId: item.id }).toArray(), members.findOne({ guildId, userId })]);
    const kept = new Set([...equippedCopyIds(member?.equipment), ...keptCopyIds(member)]);
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
  sell: async (guildId, userId, copyIds) => {
    const result = await sellCopies(guildId, userId, copyIds);
    if (!result.ok) return result.reason;
    return { count: saleCount(result.lines), earned: result.earned };
  },
  lock: (guildId, userId, copyId, locked) => setCopyLocked(guildId, userId, copyId, locked),
  setClass: setRaidClass,
  classes: raidClassesOf,
};
