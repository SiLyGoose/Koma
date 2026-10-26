import { craftTmPiece } from '../../services/technomagic.js';
import type { HeroesCrafted, TmCraftError, TmCraftKind } from '../../protocol/heroes.js';
import { CONFIG } from '../../config.js';
import { ITEMS_BY_ID } from '../../data/items.js';
import { HEROES } from '../../data/heroes.js';
import { ARTIFACT_TEXT, KR_POOLS, KR_RUNES_BY_ID, KR_SETS, KR_TM_SETS, krOptionValue, poolOption, rerollPrice, UNIQUE_REROLL_GEMS, upgradable, upgradePrice } from '../../data/kr-gear.js';
import { ESSENCES, keptPerks, transcendCost, transcendLevel, transcendPoints, type EssenceId } from '../../data/transcend.js';
import { collections } from '../../db.js';
import {
  activeSet,
  activeTmEffects,
  copyMainStat,
  countsOnce,
  fitsSlot,
  HERO_STAT_IDS,
  heroBonus,
  heroItemLines,
  heroOnly,
  heroSet,
  heroSkills,
  heroStatLines,
  heroWearable,
  heroWorn,
  krLine,
  partOf,
  perkLines,
  potentialLines,
  raidValue,
  runeLines,
  setBonusLines,
  setCounts,
  setLines,
  SIDE_SLOTS,
  socketsOf,
  treasureTier,
  wieldedBy,
  type HeroBonus,
  type HeroPiece,
  type HeroStat,
} from '../../lib/game/heroes.js';
import { uniqueTreasureText } from '../../../vendor/technomagic-sim.mjs';
import { keptCopyIds, type LoadoutFields } from '../../lib/game/items/loadouts.js';
import { maxLevelOf, refineLevel, starsOf } from '../../lib/game/items/refine.js';
import { equippedCopyIds, itemSalvage, itemSellPrice } from '../../lib/game/items/sell.js';
import { TM_SKILLS_BY_ID, tmSkillLine } from '../../lib/game/technomagic.js';
import { potentialStep, UT_ENHANCE } from '../../data/tm-potentials.js';
import { buyHero, equipHero, pickHeroPerks, transcendHero, unequipHero } from '../../services/heroes.js';
import { keepOption, keepTmSkill, rerollOption, socketRune, unsocketRune, upgradeOption } from '../../services/kr-gear.js';
import { autoSalvageOf, setAutoSalvage } from '../../services/items/salvage.js';
import { HERO_SLOTS, type HeroSlot, type ItemCopyDoc, type ItemDef, type MemberDoc } from '../../types.js';
import type { RaidClassId } from '../../constants/raid.js';
import { TM_CRYSTALS, tmSalvageCrystals, tmSalvageStones } from '../../constants/technomagic.js';
import { isTmPiece, tmStoneClass } from '../../data/kr-gear.js';
import type { TmSetId } from '../../protocol/items.js';
import { RAID_CLASS_IDS } from '../../protocol/raid.js';
import type { GearSale } from '../../protocol/gear.js';
import type { HeroCopy, HeroEquipError, HeroesView, HeroKeep, HeroOptionError, HeroPart, HeroPerksError, HeroRefineError, HeroRune, HeroRuneError, HeroRuneStack, HeroTranscendError, HeroView, SalvageRule } from '../../protocol/heroes.js';
import { gearStore, refineState } from './gear.js';

export type { HeroCopy, HeroEquipError, HeroesView, HeroPerksError, HeroRefineError, HeroTranscendError, HeroView };

/*
 * The TechnoMagic Raid's heroes on the site (GET /api/heroes, POST /api/heroes/buy, /equip, /unequip, /refine, /rune, /reroll,
 * /keep, /upgrade, /sell, /lock, /auto-salvage): every hero, what one costs and which are the member's (the shop's Heroes tab), and the gear each of
 * theirs wears (King's Raid's hero gear: data/kr-gear.ts), with what it gives it in the raid and every copy a hero could wear,
 * their runes, and how far each is transcended and the perks picked for it (the heroes page). The rules are lib/game/heroes.ts's
 * (data/transcend.ts transcendence's); buying, gearing and transcending them, services/heroes.ts; runes and options, services/kr-gear.ts.
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
  /** Puts one of their runes in a copy's socket (`rune` null: takes the one in it out): the heroes after, or why not. */
  rune: (guildId: string, userId: string, copy: string, socket: number, rune: string | null) => Promise<HeroesView | HeroRuneError>;
  /** Rerolls one of a copy's options (or its unique option), for points: the heroes after, or why not. */
  reroll: (guildId: string, userId: string, copy: string, option: number | 'unique') => Promise<HeroesView | HeroOptionError>;
  /** Keeps a TechnoMagic copy's rerolled additional skill ('new') or the one it had ('old'): the heroes after, or why not. */
  keep: (guildId: string, userId: string, copy: string, keep: HeroKeep, option: number | 'unique') => Promise<HeroesView | HeroOptionError>;
  /** Enhances one of a copy's options (its `option`th: its amount rolled again), for points: the heroes after, or why not. */
  upgrade: (guildId: string, userId: string, copy: string, option: number) => Promise<HeroesView | HeroOptionError>;
  /** Sells those of their copies that can be (the gear page's sale; `locked`: locked ones too; `salvage`: salvaged): what it came to, or 'nothing_to_sell'. */
  sell: (guildId: string, userId: string, copies: readonly string[], locked?: boolean, salvage?: boolean) => Promise<GearSale | 'nothing_to_sell'>;
  /** Locks or unlocks one of their copies (the gear page's lock): false when they don't own it. */
  lock: (guildId: string, userId: string, copy: string, locked: boolean) => Promise<boolean>;
  /** Keeps the rule their hero gear's drops are salvaged by (null: none any more): the heroes after. */
  autoSalvage: (guildId: string, userId: string, rule: SalvageRule | null) => Promise<HeroesView>;
  /** Crafts a piece of TechnoMagic `set` (any, a part picked, or a class's part picked): their heroes after and the piece, or why not. */
  craft: (guildId: string, userId: string, set: TmSetId, kind: TmCraftKind, part: HeroPart | null, cls: RaidClassId | null) => Promise<HeroesCrafted | TmCraftError>;
}

type CopyInfo = Pick<ItemCopyDoc, '_id' | 'itemId' | 'level' | 'locked' | 'tmSkill' | 'tmPotentials'> &
  Partial<Pick<ItemCopyDoc, 'obtainedAt' | 'tmArmorDef' | 'options' | 'runes' | 'tmSkillRerolls' | 'tmSkillPending' | 'optionPending' | 'reclaimed'>>;

/** A hero's additional skills as lines, one for each skill (how many, when more than one), like "✴️ Vigor ×2: Increases DMG…". */
export function skillLines(skills: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const id of skills) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].flatMap(([id, count]) => {
    const skill = TM_SKILLS_BY_ID.get(id);
    return skill ? [`✴️ ${skill.name}${count > 1 ? ` ×${count}` : ''}: ${skill.about}`] : [];
  });
}

/** A rune as the page shows it (null: none such). */
export function runeView(id: string): HeroRune | null {
  const rune = KR_RUNES_BY_ID.get(id);
  return rune ? { id: rune.id, name: rune.name, grade: rune.grade, color: rune.color, icon: rune.icon, lines: runeLines(rune.id) } : null;
}

/** The member's runes, best first (grade, then name). */
export function runeStacks(runes: MemberDoc['runes']): HeroRuneStack[] {
  return Object.entries(runes ?? {})
    .flatMap(([id, count]) => {
      const view = runeView(id);
      const rune = KR_RUNES_BY_ID.get(id);
      return view && rune && count > 0 ? [{ ...view, count, parts: [...rune.parts] as HeroPart[] }] : [];
    })
    .sort((a, b) => b.grade - a.grade || a.name.localeCompare(b.name));
}

const HERO_STAT_IDS_SET: ReadonlySet<string> = new Set(HERO_STAT_IDS);

/**
 * A copy's options as the page shows them: a unique treasure's, its potentials, each so many steps of its range's
 * (potentialStep: an enhance's), never rerolled.
 */
function optionViews(item: ItemDef, copy: CopyInfo): HeroCopy['options'] {
  if (item.uniqueTreasure) {
    return (copy.tmPotentials ?? []).flatMap((potential) => {
      const range = CONFIG.hero.potentials[potential.stat];
      const line = potentialLines([potential])[0];
      if (!range || !line) return [];
      const size = potentialStep(range);
      const steps = Math.round((range.max - range.min) / size);
      return [{ stat: potential.stat, line, step: Math.min(steps, Math.max(0, Math.round((potential.value - range.min) / size))), steps, price: 0 }];
    });
  }
  const kr = item.kr;
  if (!kr) return [];
  return (copy.options ?? []).map((option) => ({
    stat: option.stat,
    line: HERO_STAT_IDS_SET.has(option.stat) ? krLine(option.stat as HeroStat, krOptionValue(kr, option)) : option.stat,
    step: option.step,
    steps: poolOption(kr.pool, option.stat)?.steps ?? 0,
    // (A TechnoMagic piece's: its set's Boss Crystals.)
    price: isTmPiece(item) ? TM_CRYSTALS.reroll : rerollPrice(option.rerolls ?? 0),
  }));
}

/** A copy's rerolled option waiting to be kept, as its options are shown (null: none waits). */
function rerolledOptionView(item: ItemDef, copy: CopyInfo): HeroCopy['rerolledOption'] {
  const rolled = copy.optionPending;
  const view = rolled ? optionViews(item, { ...copy, options: [rolled.option] })[0] : undefined;
  return rolled && view ? { ...view, index: rolled.index } : null;
}

/** What a copy's next reroll costs (the cheapest of its options'), its unique option's, and an upgrade; null where it can't be. */
function optionCosts(item: ItemDef, copy: CopyInfo): Pick<HeroCopy, 'reroll' | 'rerollUnique' | 'upgrade'> {
  const kr = item.kr;
  const options = copy.options ?? [];
  const pool = kr?.pool ? KR_POOLS[kr.pool] : undefined;
  return {
    reroll: kr && pool && options.length > 0 ? (isTmPiece(item) ? TM_CRYSTALS.reroll : Math.min(...options.map((option) => rerollPrice(option.rerolls ?? 0)))) : null,
    // (In komaGems.)
    rerollUnique: kr?.unique ? UNIQUE_REROLL_GEMS : null,
    // (Enhancing rolls an amount again, so a copy with options always can, at their top or not; a unique treasure's too.)
    upgrade: item.uniqueTreasure ? ((copy.tmPotentials ?? []).length > 0 ? UT_ENHANCE.price : null) : kr && upgradable(kr) && options.length > 0 ? upgradePrice(kr) : null,
  };
}

/** The heroes' view, from the member's copies and member document. */
export function heroesView(
  copies: readonly CopyInfo[],
  member: (Pick<MemberDoc, 'heroes' | 'points' | 'gems' | 'essences'> & Partial<Pick<MemberDoc, 'runes' | 'runeFragments' | 'autoSalvage' | 'stones' | 'crystals'>> & Partial<LoadoutFields>) | null,
): HeroesView {
  const worn = heroWorn(member);
  // (Never used up by a refine or sold: what the member, any loadout and their heroes wear.)
  const kept = new Set([...equippedCopyIds(member?.equipment), ...keptCopyIds(member)]);
  const lit = activeTmEffects(copies, member);
  const classOf = (heroId: string | undefined): RaidClassId | null => (heroId ? (HEROES.find((one) => one.id === heroId)?.class ?? null) : null);
  // (What each hero wears, for its sets' counts.)
  const onHero = new Map<string, { item: ItemDef }[]>();
  for (const copy of copies) {
    const hero = worn.get(copy._id);
    const item = ITEMS_BY_ID.get(copy.itemId);
    if (hero && item) onHero.set(hero, [...(onHero.get(hero) ?? []), { item }]);
  }
  const list: HeroCopy[] = [];
  const pieces = new Map<string, { view: HeroCopy; piece: HeroPiece }>();
  for (const copy of copies) {
    const item = ITEMS_BY_ID.get(copy.itemId);
    const part = item ? partOf(item) : null;
    if (!item || !heroWearable(item) || part === null) continue;
    const maxLevel = maxLevelOf(item);
    // (Its stars, from 0★: King's Raid's.)
    const level = Math.min(starsOf(item, copy.level), maxLevel);
    const kr = item.kr;
    const runes = Array.from({ length: socketsOf(item) }, (_, i) => copy.runes?.[i] ?? null);
    const hero = worn.get(copy._id);
    const heroClass = classOf(hero);
    const setId = kr?.set;
    const count = setId && hero && heroClass ? (setCounts(onHero.get(hero) ?? [], heroClass).get(setId) ?? 0) : 0;
    const ownClass = heroClass ?? (kr && kr.classes.length === 1 ? (kr.classes[0] as RaidClassId) : null);
    const bonuses = setId ? setBonusLines(setId, ownClass, count) : [];
    const tmBonus = setId && KR_TM_SETS.includes(setId) ? bonuses[0] : undefined;
    const view: HeroCopy = {
      id: copy._id,
      itemId: item.id,
      name: copy.reclaimed ? `Reclaimed ${item.name}` : item.name,
      stars: item.stars,
      slot: item.slot,
      description: item.description,
      level,
      maxLevel,
      part,
      ...(copy.reclaimed && { reclaimed: true }),
      kind: kr?.kind ?? null,
      krSet: setId ? { id: setId, name: KR_SETS[setId]?.name ?? setId, tier: kr?.tier ?? 0 } : null,
      classes: kr ? [...kr.classes] : item.class ? [item.class] : [],
      icon: kr?.icon ?? null,
      options: optionViews(item, copy),
      runes: runes.map((id) => (id ? runeView(id) : null)),
      ...optionCosts(item, copy),
      setBonuses: bonuses,
      locked: copy.locked === true,
      sell: kept.has(copy._id) || copy.locked === true ? null : itemSellPrice(item),
      sellLocked: kept.has(copy._id) || copy.locked !== true ? null : itemSellPrice(item),
      ...(heroOnly(item) && { salvage: itemSalvage(item) }),
      ...(tmStoneClass(item) && { salvageStones: { class: tmStoneClass(item) as RaidClassId, count: tmSalvageStones(copy.reclaimed === true) } }),
      ...(isTmPiece(item) && kr?.set && { salvageCrystals: { set: kr.set as TmSetId, count: tmSalvageCrystals(copy.reclaimed === true) }, rerollCrystals: kr.set as TmSetId, ...(kr.unique && { rerollUniqueCrystals: TM_CRYSTALS.skillReroll }) }),
      effects: heroItemLines(item, level, copy.tmPotentials, copy.options, runes),
      mainStat: copyMainStat(item, { ...copy, level }),
      setEffect: tmBonus ? { pieces: tmBonus.pieces, text: tmBonus.text, active: lit.get(copy._id)?.set ?? false } : null,
      additional: kr?.unique ? tmSkillLine(copy.tmSkill) : null,
      rerolled: kr?.unique ? tmSkillLine(copy.tmSkillPending) : null,
      rerolledOption: rerolledOptionView(item, copy),
      additionalActive: lit.get(copy._id)?.additional ?? false,
      skill: kr?.unique ? (copy.tmSkill ?? null) : null,
      class: item.class ?? (kr && kr.classes.length === 1 ? (kr.classes[0] as RaidClassId) : null),
      heroOnly: heroOnly(item),
      uniqueWeapon: item.uniqueWeapon ?? null,
      uniqueTreasure: item.uniqueTreasure ? { hero: item.uniqueTreasure.hero, skill: item.uniqueTreasure.skill } : null,
      hero: hero ?? null,
      refine: { blocked: null, cost: null, spare: null, after: null },
    };
    const { to, ...refine } = refineState(copy._id, copies.filter((other) => other.itemId === copy.itemId), item, kept, member?.points ?? 0, member?.stones ?? {});
    view.refine = {
      ...refine,
      after: to === null ? null : heroItemLines(item, to, copy.tmPotentials, copy.options, runes),
      mainAfter: to === null ? null : copyMainStat(item, { ...copy, level: to }),
    };
    list.push(view);
    pieces.set(copy._id, {
      view,
      piece: { item, level, ...(item.uniqueTreasure && copy.tmPotentials && { potentials: copy.tmPotentials }), ...(copy.options && { options: copy.options }), runes, ...(copy.reclaimed && { reclaimed: true }) },
    });
  }
  // Best first: the unique weapons, then King's Raid's gear by tier (TechnoMagic gear's above the dragon sets'), the unique treasures, the artifacts.
  const rank = (copy: HeroCopy): number => (copy.uniqueWeapon !== null ? 20 : copy.uniqueTreasure !== null ? 4 : copy.part === 'artifact' ? 3 : (copy.krSet?.tier ?? 0) + 5);
  list.sort((a, b) => rank(b) - rank(a) || b.level - a.level || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  const heroes = HEROES.map((hero): HeroView => {
    const doc = member?.heroes?.[hero.id];
    const equipped = {} as Record<HeroSlot, string | null>;
    const on: HeroPiece[] = [];
    const skilled: { item: HeroPiece['item']; skill?: string }[] = [];
    // (Each unique treasure once: a second copy of one isn't worn. Its main treasure's effect, when it is one.)
    const treasures = new Set<string>();
    let main: HeroView['treasure'] = null;
    let artifact: HeroView['artifact'] = null;
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
      if (fits && found.piece.item.kr?.part === 'artifact') {
        const tier = starsOf(found.piece.item, found.piece.level);
        artifact = { name: found.piece.item.name, tier, text: ARTIFACT_TEXT.get(found.piece.item.id)?.[tier] ?? '' };
      }
    }
    const shares = heroBonus(on, hero.class, hero.id);
    const bonus = Object.fromEntries(HERO_STAT_IDS.map((stat) => [stat, raidValue(stat, shares[stat])])) as HeroBonus;
    const set = heroSet(on, hero.class);
    const skills = heroSkills(skilled, hero.class);
    const perks = keptPerks(doc?.perks, doc?.transcend);
    const sets = [...setCounts(on, hero.class)].map(([id, count]) => ({ id, name: KR_SETS[id]?.name ?? id, pieces: count, bonuses: setBonusLines(id, hero.class, count) }));
    return {
      id: hero.id,
      name: hero.name,
      class: hero.class,
      deals: hero.deals,
      price: CONFIG.hero.price,
      owned: doc !== undefined,
      equipped,
      bonus,
      set: set && { id: set.set, pieces: set.pieces, active: activeSet(set) !== null },
      sets,
      artifact,
      skills,
      totals: [...heroStatLines(shares), ...setLines(set, hero.class, on), ...skillLines(skills)],
      perks,
      treasure: main,
      perkEffects: perkLines(hero.id, perks),
      transcend: { level: transcendLevel(doc?.transcend), points: transcendPoints(doc?.transcend), next: transcendCost(hero.class, doc?.transcend) },
      abilities: [...hero.abilities],
    };
  });
  const essences = Object.fromEntries(ESSENCES.map((id) => [id, member?.essences?.[id] ?? 0])) as Record<EssenceId, number>;
  const stones = Object.fromEntries(RAID_CLASS_IDS.map((id) => [id, member?.stones?.[id] ?? 0])) as Record<RaidClassId, number>;
  const crystals = Object.fromEntries(KR_TM_SETS.map((id) => [id, member?.crystals?.[id as TmSetId] ?? 0])) as Record<TmSetId, number>;
  return { heroes, copies: list, balance: member?.points ?? 0, runes: runeStacks(member?.runes), runeFragments: member?.runeFragments ?? 0, gems: member?.gems ?? 0, essences, stones, crystals, craft: { tm: structuredClone(CONFIG.craft.tm), runes: { ...CONFIG.craft.runes } }, autoSalvage: autoSalvageOf(member) };
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
  rune: async (guildId, userId, copy, socket, rune) => {
    const result = rune === null ? await unsocketRune(guildId, userId, copy, socket) : await socketRune(guildId, userId, copy, socket, rune);
    return result.ok ? load(guildId, userId) : result.reason;
  },
  reroll: async (guildId, userId, copy, option) => {
    const result = await rerollOption(guildId, userId, copy, option);
    return result.ok ? load(guildId, userId) : result.reason;
  },
  keep: async (guildId, userId, copy, keep, option) => {
    const result = option === 'unique' ? await keepTmSkill(guildId, userId, copy, keep) : await keepOption(guildId, userId, copy, keep, option);
    return result.ok ? load(guildId, userId) : result.reason;
  },
  upgrade: async (guildId, userId, copy, option) => {
    const result = await upgradeOption(guildId, userId, copy, option);
    return result.ok ? load(guildId, userId) : result.reason;
  },
  sell: (guildId, userId, copies, locked, salvage) => gearStore.sell(guildId, userId, copies, locked, salvage),
  lock: (guildId, userId, copy, locked) => gearStore.lock(guildId, userId, copy, locked),
  autoSalvage: async (guildId, userId, rule) => {
    await setAutoSalvage(guildId, userId, rule);
    return load(guildId, userId);
  },
  craft: async (guildId, userId, set, kind, part, cls) => {
    const result = await craftTmPiece(guildId, userId, set, kind, part, cls);
    if (!result.ok) return result.reason;
    const { find } = result;
    return { ...(await load(guildId, userId)), crafted: { copy: find.copy ?? '', name: find.reclaimed ? `Reclaimed ${find.item.name}` : find.item.name } };
  },
};
