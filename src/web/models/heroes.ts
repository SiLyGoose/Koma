import { CONFIG } from '../../config.js';
import { REFINE } from '../../constants/index.js';
import { ITEMS_BY_ID } from '../../data/items.js';
import { HEROES } from '../../data/heroes.js';
import { TM_SET_PIECES, tmSetEffect } from '../../data/tm-sets.js';
import { ESSENCES, keptPerks, transcendCost, transcendLevel, transcendPoints, type EssenceId } from '../../data/transcend.js';
import { collections } from '../../db.js';
import { activeSet, activeTmEffects, HERO_SLOT_KIND, HERO_STAT_IDS, heroBonus, heroItemLines, heroOnly, heroSet, heroSkills, heroStatLines, heroWearable, heroWorn, raidValue, setLines, wieldedBy, type HeroBonus, type HeroPiece } from '../../lib/game/heroes.js';
import { refineLevel } from '../../lib/game/items/refine.js';
import { TM_SKILLS_BY_ID, tmSkillLine } from '../../lib/game/technomagic.js';
import { buyHero, equipHero, pickHeroPerks, transcendHero, unequipHero } from '../../services/heroes.js';
import { HERO_SLOTS, type HeroSlot, type ItemCopyDoc, type MemberDoc } from '../../types.js';
import type { HeroCopy, HeroEquipError, HeroesView, HeroPerksError, HeroTranscendError, HeroView } from '../../protocol/heroes.js';

export type { HeroCopy, HeroEquipError, HeroesView, HeroPerksError, HeroTranscendError, HeroView };

/*
 * The TechnoMagic Raid's heroes on the site (GET /api/heroes, POST /api/heroes/buy, /equip, /unequip):
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
}

type CopyInfo = Pick<ItemCopyDoc, '_id' | 'itemId' | 'level' | 'masterwork' | 'locked' | 'tmSkill' | 'tmPotentials'>;

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
export function heroesView(copies: readonly CopyInfo[], member: Pick<MemberDoc, 'heroes' | 'points' | 'gems' | 'essences'> | null): HeroesView {
  const worn = heroWorn(member);
  const lit = activeTmEffects(copies, member);
  const list: HeroCopy[] = [];
  const pieces = new Map<string, { view: HeroCopy; piece: HeroPiece }>();
  for (const copy of copies) {
    const item = ITEMS_BY_ID.get(copy.itemId);
    if (!item || !heroWearable(item)) continue;
    const level = refineLevel(copy.level);
    const masterwork = copy.masterwork === true;
    const setEffect = tmSetEffect(item);
    const view: HeroCopy = {
      id: copy._id,
      itemId: item.id,
      name: item.name,
      stars: item.stars,
      slot: item.slot,
      description: item.description,
      level,
      maxLevel: REFINE.maxLevel,
      masterwork,
      locked: copy.locked === true,
      effects: heroItemLines(item, level, masterwork, undefined, copy.tmPotentials),
      setEffect: setEffect === null ? null : { pieces: TM_SET_PIECES, text: setEffect, active: lit.get(copy._id)?.set ?? false },
      additional: item.tmDrop ? tmSkillLine(copy.tmSkill) : null,
      additionalActive: lit.get(copy._id)?.additional ?? false,
      skill: item.tmDrop ? (copy.tmSkill ?? null) : null,
      class: item.class ?? null,
      heroOnly: heroOnly(item),
      uniqueWeapon: item.uniqueWeapon ?? null,
      hero: worn.get(copy._id) ?? null,
    };
    list.push(view);
    pieces.set(copy._id, { view, piece: { item, level, bonus: masterwork, ...(item.tmDrop && copy.tmPotentials && { potentials: copy.tmPotentials }) } });
  }
  // Best first: TechnoMagic gear (a tier of its own, above 4 stars), the unique weapons (between it and 4 stars), then by stars.
  const tier = (copy: HeroCopy): number => (copy.uniqueWeapon !== null ? 4.5 : copy.heroOnly ? 5 : copy.stars);
  list.sort((a, b) => tier(b) - tier(a) || b.level - a.level || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  const heroes = HEROES.map((hero): HeroView => {
    const doc = member?.heroes?.[hero.id];
    const equipped = {} as Record<HeroSlot, string | null>;
    const on: HeroPiece[] = [];
    const skilled: { item: HeroPiece['item']; skill?: string }[] = [];
    let unique = false;
    for (const slot of HERO_SLOTS) {
      const found = pieces.get(doc?.equipment?.[slot] ?? '');
      const fits = found !== undefined && found.view.slot === HERO_SLOT_KIND[slot] && found.view.hero === hero.id && wieldedBy(found.piece.item, hero.id);
      equipped[slot] = fits ? found.view.id : null;
      // (As the raid counts it: one unique weapon, a second copy of it doing nothing.)
      if (fits && !(found.view.uniqueWeapon !== null && unique)) on.push(found.piece);
      if (fits && found.view.uniqueWeapon !== null) unique = true;
      if (fits) skilled.push({ item: found.piece.item, ...(found.view.skill !== null && { skill: found.view.skill }) });
    }
    const shares = heroBonus(on, hero.class, hero.id);
    const bonus = Object.fromEntries(HERO_STAT_IDS.map((stat) => [stat, raidValue(stat, shares[stat])])) as HeroBonus;
    const set = heroSet(on, hero.class);
    const skills = heroSkills(skilled, hero.class);
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
      perks: keptPerks(doc?.perks, doc?.transcend),
      transcend: { level: transcendLevel(doc?.transcend), points: transcendPoints(doc?.transcend), next: transcendCost(hero.class, doc?.transcend) },
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
};
