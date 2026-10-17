import { CONFIG } from '../../config.js';
import { REFINE } from '../../constants/index.js';
import { ITEMS_BY_ID } from '../../data/items.js';
import { HEROES } from '../../data/heroes.js';
import { TM_SET_PIECES, tmSetEffect } from '../../data/tm-sets.js';
import { ESSENCES, keptPerks, transcendCost, transcendLevel, transcendPoints, type EssenceId } from '../../data/transcend.js';
import { collections } from '../../db.js';
import { activeSet, activeTmEffects, copyMainStat, countsOnce, SIDE_SLOTS, fitsSlot, HERO_STAT_IDS, heroBonus, heroItemLines, heroOnly, heroSet, heroSkills, heroStatLines, heroWearable, perkLines, heroWorn, raidValue, setLines, treasureTier, wieldedBy, type HeroBonus, type HeroPiece } from '../../lib/game/heroes.js';
import { uniqueTreasureText } from '../../../vendor/technomagic-sim.mjs';
import { keptCopyIds, type LoadoutFields } from '../../lib/game/items/loadouts.js';
import { maxLevelOf, refineLevel } from '../../lib/game/items/refine.js';
import { equippedCopyIds, itemSellPrice } from '../../lib/game/items/sell.js';
import { TM_SKILLS_BY_ID, tmSkillLine } from '../../lib/game/technomagic.js';
import { buyHero, equipHero, pickHeroPerks, transcendHero, unequipHero } from '../../services/heroes.js';
import { HERO_SLOTS, type HeroSlot, type ItemCopyDoc, type MemberDoc } from '../../types.js';
import type { GearSale } from '../../protocol/gear.js';
import type { HeroCopy, HeroEquipError, HeroesView, HeroPerksError, HeroRefineError, HeroTranscendError, HeroView } from '../../protocol/heroes.js';
import { gearStore, refineState } from './gear.js';

export type { HeroCopy, HeroEquipError, HeroesView, HeroPerksError, HeroRefineError, HeroTranscendError, HeroView };

/*
 * The TechnoMagic Raid's heroes on the site (GET /api/heroes, POST /api/heroes/buy, /equip, /unequip, /refine, /sell, /lock):
 * every hero, what one costs and which are the member's (the shop's Heroes tab), and the gear each of theirs
 * wears, with what it gives it in the raid and every copy a hero could wear, and how far each is transcended
 * and the perks picked for it (the heroes page). The rules are lib/game/heroes.ts's (data/transcend.ts
 * transcendence's); buying, gearing and transcending them, services/heroes.ts.
 */

/** What the hero routes use (the database's, unless a test says otherwise). */
export interface HeroStore {
  view: (guildId: string, userId: string) => Promise<HeroesView>;
  /** Who in a server has heroes, and how many: the most first, at most `limit` of them. */
  owners: (guildId: string, limit: number) => Promise<{ userId: string; heroes: number }[]>;
  /** Buys a hero: the heroes after, or why not (nothing was spent). */
  buy: (guildId: string, userId: string, id: string) => Promise<HeroesView | 'not_found' | 'owned' | 'too_poor'>;
  /** Puts one of their copies in one of their hero's slots (off any other hero it was on): the heroes after, or why not. */
  equip: (guildId: string, userId: string, hero: string, slot: HeroSlot, copy: string) => Promise<HeroesView | HeroEquipError>;
  /** Empties one of their hero's slots, or (`slot` null) all of them: the heroes after, or 'not_found' for a hero that isn't theirs. */
  unequip: (guildId: string, userId: string, hero: string, slot: HeroSlot | null) => Promise<HeroesView | 'not_found'>;
  /** Picks their hero's transcendence perks, all of them at once (none: reset): the heroes after, or why not. */
  perks: (guildId: string, userId: string, hero: string, perks: readonly string[]) => Promise<HeroesView | HeroPerksError>;
  /** Transcends their hero one level: the heroes after, or why not. */
  transcend: (guildId: string, userId: string, hero: string) => Promise<HeroesView | HeroTranscendError>;
  /** Refines one of their copies a level (the gear page's refine, a spare copy of it used up): the heroes after, or why not. */
  refine: (guildId: string, userId: string, copy: string) => Promise<HeroesView | HeroRefineError>;
  /** Sells those of their copies that can be (the gear page's sale): what it came to, or 'nothing_to_sell'. */
  sell: (guildId: string, userId: string, copies: readonly string[]) => Promise<GearSale | 'nothing_to_sell'>;
  /** Locks or unlocks one of their copies (the gear page's lock): false when they don't own it. */
  lock: (guildId: string, userId: string, copy: string, locked: boolean) => Promise<boolean>;
}

type CopyInfo = Pick<ItemCopyDoc, '_id' | 'itemId' | 'level' | 'locked' | 'tmSkill' | 'tmPotentials'> & Partial<Pick<ItemCopyDoc, 'obtainedAt' | 'tmArmorDef'>>;

/** A hero's additional skills as lines, one for each skill (how many, when more than one), like "✴️ Vigor ×2: Increases DMG…". */
export function skillLines(skills: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const id of skills) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].flatMap(([id, count]) => {
    const skill = TM_SKILLS_BY_ID.get(id);
    return skill ? [`✴️ ${skill.name}${count > 1 ? ` ×${count}` : ''}: ${skill.about}`] : [];
  });
}

/** The heroes' view, from the member's copies and member document. */
export function heroesView(copies: readonly CopyInfo[], member: (Pick<MemberDoc, 'heroes' | 'points' | 'gems' | 'essences'> & Partial<LoadoutFields>) | null): HeroesView {
  const worn = heroWorn(member);
  // (Never used up by a refine or sold: what the member, any loadout and their heroes wear.)
  const kept = new Set([...equippedCopyIds(member?.equipment), ...keptCopyIds(member)]);
  const lit = activeTmEffects(copies, member);
  const list: HeroCopy[] = [];
  const pieces = new Map<string, { view: HeroCopy; piece: HeroPiece }>();
  for (const copy of copies) {
    const item = ITEMS_BY_ID.get(copy.itemId);
    if (!item || !heroWearable(item)) continue;
    // (TechnoMagic gear is never refined: R1, whatever level a copy was refined to back when it could be.)
    const maxLevel = maxLevelOf(item);
    const level = Math.min(refineLevel(copy.level), maxLevel);
    const setEffect = tmSetEffect(item);
    const view: HeroCopy = {
      id: copy._id,
      itemId: item.id,
      name: item.name,
      stars: item.stars,
      slot: item.slot,
      description: item.description,
      level,
      maxLevel,
      locked: copy.locked === true,
      sell: kept.has(copy._id) || copy.locked === true ? null : itemSellPrice(item),
      effects: heroItemLines(item, level, undefined, copy.tmPotentials),
      mainStat: copyMainStat(item, copy),
      setEffect: setEffect === null ? null : { pieces: TM_SET_PIECES, text: setEffect, active: lit.get(copy._id)?.set ?? false },
      additional: item.tmDrop ? tmSkillLine(copy.tmSkill) : null,
      additionalActive: lit.get(copy._id)?.additional ?? false,
      skill: item.tmDrop ? (copy.tmSkill ?? null) : null,
      class: item.class ?? null,
      heroOnly: heroOnly(item),
      uniqueWeapon: item.uniqueWeapon ?? null,
      uniqueTreasure: item.uniqueTreasure ? { hero: item.uniqueTreasure.hero, skill: item.uniqueTreasure.skill } : null,
      hero: worn.get(copy._id) ?? null,
      refine: { blocked: null, cost: null, spare: null, after: null },
    };
    const { to, ...refine } = refineState(copy._id, copies.filter((other) => other.itemId === copy.itemId), item, kept, member?.points ?? 0);
    view.refine = { ...refine, after: to === null ? null : heroItemLines(item, to, undefined, copy.tmPotentials) };
    list.push(view);
    pieces.set(copy._id, { view, piece: { item, level, ...((item.tmDrop || item.uniqueTreasure) && copy.tmPotentials && { potentials: copy.tmPotentials }), ...(copy.tmArmorDef && { armorDef: copy.tmArmorDef }) } });
  }
  // Best first: TechnoMagic gear (a tier of its own, above 4 stars), the unique weapons, then the unique treasures (between it and 4 stars), then by stars.
  const tier = (copy: HeroCopy): number => (copy.uniqueWeapon !== null ? 4.5 : copy.uniqueTreasure !== null ? 4.4 : copy.heroOnly ? 5 : copy.stars);
  list.sort((a, b) => tier(b) - tier(a) || b.level - a.level || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  const heroes = HEROES.map((hero): HeroView => {
    const doc = member?.heroes?.[hero.id];
    const equipped = {} as Record<HeroSlot, string | null>;
    const on: HeroPiece[] = [];
    const skilled: { item: HeroPiece['item']; skill?: string }[] = [];
    // (Each unique treasure once: a second copy of one isn't worn. Its main treasure's effect, when it is one.)
    const treasures = new Set<string>();
    let main: HeroView['treasure'] = null;
    let underUt = false;
    for (const slot of HERO_SLOTS) {
      const found = pieces.get(doc?.equipment?.[slot] ?? '');
      // (A sub treasure only under a main one that is a unique treasure: the treasure slot comes first.)
      const fits = found !== undefined && fitsSlot(found.piece.item, slot) && found.view.hero === hero.id && wieldedBy(found.piece.item, hero.id) && (underUt || !SIDE_SLOTS.includes(slot)) && countsOnce(found.piece.item, treasures);
      if (fits && slot === 'treasure' && found.piece.item.uniqueTreasure) underUt = true;
      equipped[slot] = fits ? found.view.id : null;
      if (fits) on.push(slot === 'treasure' ? { ...found.piece, main: true } : found.piece);
      if (fits) skilled.push({ item: found.piece.item, ...(found.view.skill !== null && { skill: found.view.skill }) });
      const ut = fits && slot === 'treasure' ? found.piece.item.uniqueTreasure : undefined;
      const effect = ut && found ? uniqueTreasureText(hero.id, ut.skill, treasureTier(found.piece.level)) : null;
      if (ut && found && effect) main = { name: effect.name, skill: ut.skill, tier: treasureTier(found.piece.level), text: effect.text };
    }
    const shares = heroBonus(on, hero.class, hero.id);
    const bonus = Object.fromEntries(HERO_STAT_IDS.map((stat) => [stat, raidValue(stat, shares[stat])])) as HeroBonus;
    const set = heroSet(on, hero.class);
    const skills = heroSkills(skilled, hero.class);
    const perks = keptPerks(doc?.perks, doc?.transcend);
    return {
      id: hero.id,
      name: hero.name,
      class: hero.class,
      price: CONFIG.hero.price,
      owned: doc !== undefined,
      equipped,
      bonus,
      set: set && { id: set.set, pieces: set.pieces, active: activeSet(set) !== null },
      skills,
      totals: [...heroStatLines(shares), ...setLines(set, hero.class), ...skillLines(skills)],
      perks,
      treasure: main,
      perkEffects: perkLines(hero.id, perks),
      transcend: { level: transcendLevel(doc?.transcend), points: transcendPoints(doc?.transcend), next: transcendCost(hero.class, doc?.transcend) },
      abilities: [...hero.abilities],
    };
  });
  const essences = Object.fromEntries(ESSENCES.map((id) => [id, member?.essences?.[id] ?? 0])) as Record<EssenceId, number>;
  return { heroes, copies: list, balance: member?.points ?? 0, gems: member?.gems ?? 0, essences };
}

async function load(guildId: string, userId: string): Promise<HeroesView> {
  const { items, members } = collections();
  const [copies, member] = await Promise.all([items.find({ guildId, userId }).toArray(), members.findOne({ guildId, userId })]);
  return heroesView(copies, member);
}

export const heroStore: HeroStore = {
  view: load,
  owners: async (guildId, limit) => {
    const docs = await collections()
      .members.find({ guildId, heroes: { $exists: true } }, { projection: { userId: 1, heroes: 1 } })
      .toArray();
    return docs
      .map((doc) => ({ userId: doc.userId, heroes: Object.keys(doc.heroes ?? {}).filter((id) => HEROES.some((hero) => hero.id === id)).length }))
      .filter((owner) => owner.heroes > 0)
      .sort((a, b) => b.heroes - a.heroes || a.userId.localeCompare(b.userId))
      .slice(0, limit);
  },
  buy: async (guildId, userId, id) => {
    const result = await buyHero(guildId, userId, id);
    return result.ok ? load(guildId, userId) : result.reason;
  },
  equip: async (guildId, userId, hero, slot, copy) => {
    const result = await equipHero(guildId, userId, hero, slot, copy);
    return result.ok ? load(guildId, userId) : result.reason;
  },
  unequip: async (guildId, userId, hero, slot) => ((await unequipHero(guildId, userId, hero, slot)) ? load(guildId, userId) : 'not_found'),
  perks: async (guildId, userId, hero, perks) => {
    const result = await pickHeroPerks(guildId, userId, hero, perks);
    return result.ok ? load(guildId, userId) : result.reason;
  },
  transcend: async (guildId, userId, hero) => {
    const result = await transcendHero(guildId, userId, hero);
    return result.ok ? load(guildId, userId) : result.reason;
  },
  refine: async (guildId, userId, copy) => {
    const result = await gearStore.refine(guildId, userId, copy, null);
    return result === 'ok' ? load(guildId, userId) : result;
  },
  sell: (guildId, userId, copies) => gearStore.sell(guildId, userId, copies),
  lock: (guildId, userId, copy, locked) => gearStore.lock(guildId, userId, copy, locked),
};
