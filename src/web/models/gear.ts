import { collections } from '../../db.js';
import { REFINE } from '../../constants/index.js';
import { ITEMS_BY_ID } from '../../data/items.js';
import { DEFAULT_OUTFIT } from '../../data/outfits.js';
import { canUseItem, describeEffects, describeTotals, itemEffectiveness, totalEffects, type GearPiece } from '../../lib/game/items/equipment.js';
import { keptCopyIds, loadoutsOf, lockedLoadoutsOf, type LoadoutView, type LockedLoadout } from '../../lib/game/items/loadouts.js';
import { activeTmEffects, copyMainStat, heroItemLines, heroOnly, heroWorn, partOf, potentialLines, type TmEffectsOn } from '../../lib/game/heroes.js';
import { tmSkillLine } from '../../lib/game/technomagic.js';
import { HEROES_BY_ID } from '../../data/heroes.js';
import { TM_SET_PIECES, tmSetEffect } from '../../data/tm-sets.js';
import { leastStars, maxLevelOf, refineable, refineCopyPlan, refineCost, refineLevel, starsOf } from '../../lib/game/items/refine.js';
import { equippedCopyIds, itemSalvage, itemSellPrice, saleCount } from '../../lib/game/items/sell.js';
import { equipCopy, unequipAll, unequipSlot } from '../../services/items/equipment.js';
import { setCopyLocked } from '../../services/items/lock.js';
import { refineItem } from '../../services/items/refine.js';
import { sellCopies } from '../../services/items/sell.js';
import { wornOutfit } from '../../services/outfits.js';
import { raidClassesOf, raidClassOf, setRaidClass } from '../../services/raid-class.js';
import { classTraits } from '../../lib/game/raid-classes.js';
import { RAID_CLASS_IDS, TEXT, type RaidClassId } from '../../constants/index.js';
import { renameLoadout, switchLoadout, unlockLoadout } from '../../services/items/loadouts.js';
import type { EquipmentDoc, ItemCopyDoc, ItemDef, MemberDoc, Slot } from '../../types.js';
import { gearStats } from './stats.js';
import { SLOTS } from '../../types.js';
import type { GearCopy, GearLoadout, GearRefine, GearSale, GearView, LoadoutNameBlock, RefineBlock } from '../../protocol/gear.js';

export type { GearCopy, GearLoadout, GearRefine, GearSale, GearView, LoadoutNameBlock, RefineBlock };

/*
 * The site's gear page (GET /api/gear and /api/gear/members, POST /api/gear/equip, /unequip, /unequip-all, /loadout, /loadout/rename, /loadout/unlock, /refine, /sell and /lock):
 * every copy a member owns, what each one does at its level, which copy sits in each slot, and their
 * loadouts; and, to look at, the same for anyone else in the server with gear. The effect lines
 * are the gear card's, as Discord shows them (custom emoji codes and *italics* included); the page
 * draws those itself.
 */

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
    lockedLoadouts: [],
    balance: null,
  };
}

/** What the gear routes use (the database's, unless a test says otherwise). */
export interface GearStore {
  view: (guildId: string, userId: string) => Promise<GearView>;
  /** Someone else's gear, to look at: without their points (so no refine is held back for the price). */
  peek: (guildId: string, userId: string) => Promise<GearView>;
  /** Who in the server owns any gear, and how many copies, most first (at most `limit`). */
  owners: (guildId: string, limit: number) => Promise<{ userId: string; copies: number }[]>;
  /** False when the member doesn't own that copy. */
  equip: (guildId: string, userId: string, copyId: string) => Promise<boolean>;
  unequip: (guildId: string, userId: string, slot: Slot) => Promise<void>;
  unequipAll: (guildId: string, userId: string) => Promise<void>;
  /** 'ok', 'busy' when their loadouts kept changing while switching (nothing changed), or 'loadout_locked' when they haven't unlocked it. */
  switchLoadout: (guildId: string, userId: string, number: number) => Promise<'ok' | 'busy' | 'loadout_locked'>;
  /** Names loadout `number` (an empty name: its default one again): 'ok', or why it can't have that name (or 'loadout_locked'). */
  renameLoadout: (guildId: string, userId: string, number: number, name: string) => Promise<'ok' | LoadoutNameBlock | 'loadout_locked'>;
  /**
   * Unlocks loadout `number` for its price: 'ok', or why not ('owned' when they have it, 'loadout_locked' when another
   * comes first, 'maxed' when there's none left, 'too_poor', or 'busy' when their loadouts changed meanwhile).
   */
  unlockLoadout: (guildId: string, userId: string, number: number) => Promise<'ok' | 'owned' | 'loadout_locked' | 'maxed' | 'too_poor' | 'busy'>;
  /**
   * Refines that copy one level, using up `materialId` (null: the lowest-level spare it could use): 'ok',
   * or why not ('not_found' when they don't own it, 'bad_material' when that material can't be used up,
   * 'busy' when their copies changed meanwhile).
   */
  refine: (guildId: string, userId: string, copyId: string, materialId: string | null) => Promise<'ok' | RefineBlock | 'bad_material' | 'not_found' | 'busy'>;
  /**
   * Sells those copies (the ones still theirs and not worn or in a loadout; nor locked, unless `locked`): how many were
   * sold and for how many points, or 'nothing_to_sell' when none of them could be. `salvage`: the hero gear among them
   * salvaged for komaDust instead.
   */
  sell: (guildId: string, userId: string, copyIds: readonly string[], locked?: boolean, salvage?: boolean) => Promise<GearSale | 'nothing_to_sell'>;
  /** Locks or unlocks that copy: false when they don't own it. */
  lock: (guildId: string, userId: string, copyId: string, locked: boolean) => Promise<boolean>;
  /** Sets their raid class (null: none). */
  setClass: (guildId: string, userId: string, id: RaidClassId | null) => Promise<void>;
  /** Each of those members' raid classes, in their order (the roster's badges). */
  classes: (guildId: string, userIds: readonly string[]) => Promise<(RaidClassId | null)[]>;
}

export type CopyInfo = Pick<ItemCopyDoc, '_id' | 'itemId' | 'level' | 'locked'> & Partial<Pick<ItemCopyDoc, 'obtainedAt' | 'tmSkill' | 'tmPotentials' | 'tmArmorDef'>>;

/**
 * Whether refining `copyId` itself (a copy of `item`) can be done, with the member's copies of its item (`sameItem`), the
 * copies they wear or keep in any loadout (`kept`, never used up), and their points (null: not known,
 * never too poor), and the level it would go up to (null when it can't). TechnoMagic gear, never refined, is at its top.
 */
export function refineState(
  copyId: string,
  sameItem: readonly CopyInfo[],
  item: Pick<ItemDef, 'stars' | 'tmDrop'>,
  kept: ReadonlySet<string>,
  balance: number | null,
): Omit<GearRefine, 'after'> & { to: number | null } {
  if (!refineable(item)) return { blocked: 'maxed', cost: null, spare: null, to: null };
  const plan = refineCopyPlan(
    sameItem.map((copy) => ({ ...copy, obtainedAt: copy.obtainedAt ?? new Date(0) })),
    copyId,
    null,
    kept,
    leastStars(item),
  );
  if (!plan.ok && (plan.reason === 'not_owned' || plan.reason === 'bad_material')) return { blocked: 'no_duplicate', cost: null, spare: null, to: null };
  const level = plan.ok ? plan.from : plan.level;
  const to = level < REFINE.maxLevel ? level + 1 : null;
  const cost = to === null ? null : refineCost(item.stars, to);
  if (!plan.ok) return { blocked: plan.reason, cost, spare: null, to: plan.reason === 'maxed' ? null : to };
  const spare = starsOf(item, plan.fodder.level);
  if (balance !== null && cost !== null && balance < cost) return { blocked: 'too_poor', cost, spare, to };
  return { blocked: null, cost, spare, to };
}

/**
 * The gear page's view of `copies` (all a member owns), with `equipment` what they wear,
 * `loadouts` all their loadouts (by default just the one they're wearing) and `balance` their points
 * (null when not known: no refine is then held back for the price),
 * `outfit` the outfit they wear, `raidClass` their raid class, `heroWorn` the copies their heroes wear
 * (each with the hero's name), `tmOn` which of their TechnoMagic copies' effects are on (activeTmEffects) and `locked` the
 * loadouts they could unlock (none for someone else's).
 */
export function gearView(
  copies: readonly CopyInfo[],
  equipment: EquipmentDoc | null | undefined,
  userId: string,
  loadouts: readonly LoadoutView[] = loadoutsOf({ equipment: equipment ?? undefined }),
  balance: number | null = null,
  outfit: string = DEFAULT_OUTFIT,
  raidClass: RaidClassId | null = null,
  heroWorn: ReadonlyMap<string, string> = new Map(),
  tmOn: ReadonlyMap<string, TmEffectsOn> = new Map(),
  locked: readonly LockedLoadout[] = [],
): GearView {
  const wornIds = equippedCopyIds(equipment);
  const kept = new Set([...wornIds, ...heroWorn.keys()]);
  for (const loadout of loadouts) for (const id of equippedCopyIds(loadout.equipment)) kept.add(id);

  const list: GearCopy[] = [];
  /** Each copy's view, with its item and level. */
  const byId = new Map<string, { view: GearCopy; piece: GearPiece }>();
  for (const copy of copies) {
    const item = ITEMS_BY_ID.get(copy.itemId);
    if (!item) continue;
    // (A TechnoMagic copy refined back when it could be is R1 all the same: its level never counted.)
    const maxLevel = maxLevelOf(item);
    // (Its stars: a hero's gear's from 0★.)
    const level = Math.min(starsOf(item, copy.level), maxLevel);
    const locked = copy.locked === true;
    const share = itemEffectiveness(item, userId);
    const setEffect = tmSetEffect(item);
    const view: GearCopy = {
      id: copy._id,
      itemId: item.id,
      name: item.name,
      stars: item.stars,
      slot: item.slot,
      part: partOf(item),
      description: item.description,
      level,
      maxLevel,
      effects: item.tmDrop || item.uniqueTreasure ? heroItemLines(item, level, copy.tmPotentials) : describeEffects(item, share, level),
      mainStat: copyMainStat(item, copy),
      setEffect: setEffect === null ? null : { pieces: TM_SET_PIECES, text: setEffect, active: tmOn.get(copy._id)?.set ?? false },
      additional: item.tmDrop ? tmSkillLine(copy.tmSkill) : null,
      additionalActive: tmOn.get(copy._id)?.additional ?? false,
      wrongClass: tmOn.get(copy._id)?.works === false,
      borrowed: canUseItem(item, userId) ? null : share,
      refine: { blocked: null, cost: null, spare: null, after: null },
      locked,
      sell: kept.has(copy._id) || locked ? null : itemSellPrice(item),
      ...(heroOnly(item) && { salvage: itemSalvage(item) }),
      heroOnly: heroOnly(item),
      uniqueWeapon: item.uniqueWeapon ?? null,
      uniqueTreasure: item.uniqueTreasure ? { hero: item.uniqueTreasure.hero, skill: item.uniqueTreasure.skill } : null,
      itemClass: item.class ?? null,
      hero: heroWorn.get(copy._id) ?? null,
    };
    const { to, ...refine } = refineState(copy._id, copies.filter((other) => other.itemId === copy.itemId), item, kept, balance);
    view.refine = {
      ...refine,
      after: to === null ? null : item.uniqueTreasure ? heroItemLines(item, to, copy.tmPotentials) : describeEffects(item, share, to),
      mainAfter: to === null ? null : copyMainStat(item, { ...copy, level: to }),
    };
    list.push(view);
    byId.set(view.id, { view, piece: { item, level } });
  }
  // Best first: TechnoMagic gear (a tier of its own, above 4 stars), the unique weapons (between it and 4 stars), then by stars.
  const tier = (copy: GearCopy): number => (copy.uniqueWeapon !== null ? 4.5 : copy.uniqueTreasure !== null ? 4.4 : copy.heroOnly ? 5 : copy.stars);
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
    lockedLoadouts: locked.map(({ number, price }) => ({ number, price })),
    balance,
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
    return gearView(
      copies,
      member?.equipment,
      userId,
      loadoutsOf(member),
      member?.points ?? 0,
      wornOutfit(member),
      raidClassOf(member),
      heroNames(member),
      activeTmEffects(copies, member),
      lockedLoadoutsOf(member),
    );
  },
  peek: async (guildId, userId) => {
    const { items, members } = collections();
    const [copies, member] = await Promise.all([items.find({ guildId, userId }).toArray(), members.findOne({ guildId, userId })]);
    return gearView(copies, member?.equipment, userId, loadoutsOf(member), null, wornOutfit(member), raidClassOf(member), heroNames(member), activeTmEffects(copies, member));
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
  switchLoadout: async (guildId, userId, number) => {
    const result = await switchLoadout(guildId, userId, number);
    return result.ok ? 'ok' : result.reason === 'locked' ? 'loadout_locked' : 'busy';
  },
  renameLoadout: async (guildId, userId, number, name) => {
    const result = await renameLoadout(guildId, userId, number, name);
    return result.ok ? 'ok' : result.reason === 'locked' ? 'loadout_locked' : `name_${result.reason}`;
  },
  unlockLoadout: async (guildId, userId, number) => {
    const result = await unlockLoadout(guildId, userId, number);
    return result.ok ? 'ok' : result.reason === 'locked' ? 'loadout_locked' : result.reason;
  },
  refine: async (guildId, userId, copyId, materialId) => {
    const { items, members } = collections();
    const copy = await items.findOne({ _id: copyId, guildId, userId });
    const item = copy && ITEMS_BY_ID.get(copy.itemId);
    if (!copy || !item) return 'not_found';
    // This copy is the one raised, whatever level its item's other copies are at.
    const [sameItem, member] = await Promise.all([items.find({ guildId, userId, itemId: item.id }).toArray(), members.findOne({ guildId, userId })]);
    const kept = new Set([...equippedCopyIds(member?.equipment), ...keptCopyIds(member)]);
    const state = refineState(copyId, sameItem, item, kept, member?.points ?? 0);
    if (state.blocked) return state.blocked;
    const result = await refineItem(guildId, userId, item, { copy: copyId, material: materialId });
    if (result.ok) return 'ok';
    // (TechnoMagic gear is at its one level, as refineState says.)
    return result.reason === 'not_owned' ? 'not_found' : result.reason === 'not_refineable' ? 'maxed' : result.reason;
  },
  sell: async (guildId, userId, copyIds, locked = false, salvage = false) => {
    const result = await sellCopies(guildId, userId, copyIds, { locked, salvage });
    if (!result.ok) return result.reason;
    return { count: saleCount(result.lines), earned: result.earned, powder: result.powder };
  },
  lock: (guildId, userId, copyId, locked) => setCopyLocked(guildId, userId, copyId, locked),
  setClass: setRaidClass,
  classes: raidClassesOf,
};
