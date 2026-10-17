import { REFINE } from '../../constants/index.js';
import type { RaidClassId } from '../../constants/raid.js';
import { HEROES } from '../../data/heroes.js';
import { ITEMS_BY_ID, uniqueOwner } from '../../data/items.js';
import { tmMainStat } from '../../data/tm-main.js';
import { TM_POTENTIAL_NAME } from '../../data/tm-potentials.js';
import { TM_SET_PIECES, TM_SETS_BY_ID } from '../../data/tm-sets.js';
import type { EffectId } from '../../perks/index.js';
import { uwAttack } from '../../data/uw-attack.js';
import { utHp } from '../../data/ut-hp.js';
import { HERO_SLOTS, type HeroDoc, type HeroSlot, type ItemCopyDoc, type ItemDef, type MemberDoc, type TmArmorDef, type TmPotential, type TmSetId } from '../../types.js';
import { fmt, formatPercent } from '../format.js';
import { effectStrength, itemEffects, perkShare, type GearPiece } from './items/equipment.js';
import { refineLevel } from './items/refine-share.js';
import { tmPerkStats, uniqueTreasureText, uniqueWeaponText } from '../../../vendor/technomagic-sim.mjs';
import { HERO_SLOT_KIND, SIDE_SLOTS } from '../../protocol/heroes.js';
import { HERO_STAT_IDS, type HeroBonus, type HeroStat } from '../../protocol/heroes.js';
import type { MainStat } from '../../protocol/items.js';

export { HERO_SLOT_KIND, HERO_STAT_IDS, SIDE_SLOTS, type HeroBonus, type HeroStat };

/*
 * The TechnoMagic Raid's heroes (data/heroes.ts), with no database: which gear they wear, where, and what
 * it does for them in the raid. A hero wears the raid's gear (ItemDef.raidDrop) and the TechnoMagic Raid's
 * (ItemDef.tmDrop): two weapons, two armors and a treasure (only TechnoMagic gear has treasures). A copy
 * can be on the member and on one of their heroes at once, but on one hero only, in one slot.
 *
 * What gear does for a hero is its stats in the raid (the raid's own, Koma-UI's src/technomagic/): each of the
 * raid gear's perks raises the one most like what it does in the raid (FROM_PERK), by as much or by a share of
 * it. TechnoMagic gear has no perks: its main stat (King's Raid's: a weapon's HP, an armor's P.DEF or M.DEF, its copy's
 * ItemCopyDoc.tmArmorDef: data/tm-main.ts), added as it is, and each of a copy's potentials (ItemCopyDoc.tmPotentials),
 * which raises the stat of its name, are all it gives (with its set and additional skill). A class item only works on a hero of its
 * class. A hero's unique weapon (ItemDef.uniqueWeapon) only goes on its own hero, in its first weapon slot: it adds King's Raid's flat ATK
 * for its hero's class and refinement (data/uw-attack.ts), and has its own effect in the raid (the raid's sim,
 * which says what it does: uniqueWeaponText). A hero's unique treasures (ItemDef.uniqueTreasure) only go on their own
 * hero too, as King's Raid's: one in its treasure slot (its main treasure), and up to three more in its sub treasure slots
 * (SIDE_SLOTS), each a different one, only while its main treasure is one of them (only a unique treasure has sub
 * treasures). Wherever it is, a unique treasure gives its options (its copy's tmPotentials, as TechnoMagic gear's
 * potentials); only the main one has its HP and its effect in the raid (uniqueTreasureText).
 */

/** The one slot a unique weapon goes in: a hero's first weapon slot (so a hero wields one at most). */
export const UNIQUE_SLOT: HeroSlot = 'weapon1';

/**
 * The hero's slots an item fits in, in order: those of its kind (not the sub treasure slots), a unique weapon only
 * UNIQUE_SLOT, and a unique treasure its treasure slot and the sub treasure slots (SIDE_SLOTS).
 */
export const heroSlotsFor = (item: Pick<ItemDef, 'slot' | 'uniqueWeapon' | 'uniqueTreasure'>): HeroSlot[] =>
  item.uniqueWeapon !== undefined
    ? [UNIQUE_SLOT]
    : item.uniqueTreasure !== undefined
      ? ['treasure', ...SIDE_SLOTS]
      : HERO_SLOTS.filter((slot) => HERO_SLOT_KIND[slot] === item.slot && !SIDE_SLOTS.includes(slot));

/** Whether an item goes in a hero's `slot` (heroSlotsFor). */
export const fitsSlot = (item: Pick<ItemDef, 'slot' | 'uniqueWeapon' | 'uniqueTreasure'>, slot: HeroSlot): boolean => heroSlotsFor(item).includes(slot);

/** Whether a hero can wear an item at all: the raid's gear, the TechnoMagic Raid's, and the unique weapons and treasures (each only on its own hero: wieldedBy). */
export const heroWearable = (item: ItemDef): boolean => item.raidDrop === true || item.tmDrop === true || uniqueOwner(item) !== undefined;

/** Whether only heroes wear an item (the member can't): the TechnoMagic gear, and the unique weapons and treasures. */
export const heroOnly = (item: ItemDef): boolean => item.tmDrop === true || uniqueOwner(item) !== undefined;

/** Whether hero `heroId` may wear an item: any of them, but a unique weapon or treasure only its own. */
export const wieldedBy = (item: ItemDef, heroId: string): boolean => {
  const owner = uniqueOwner(item);
  return owner === undefined || owner === heroId;
};

/** A unique treasure's tier in the raid, by how far its copy is refined (R1 to R5: tiers 1 to 5, Koma-UI's sim/treasures.ts). */
export const treasureTier = (level: number): number => refineLevel(level);

/** A unique weapon's tier in the raid, by how far its copy is refined (R1 to R5: tiers 1 to 5, Koma-UI's sim/unique.ts). */
export const uniqueTier = (level: number): number => refineLevel(level);

/** The member's heroes that still exist in `known` (data/heroes.ts's ids), by id. */
export function ownedHeroes(member: Pick<MemberDoc, 'heroes'> | null | undefined, known: ReadonlySet<string>): Map<string, HeroDoc> {
  return new Map(Object.entries(member?.heroes ?? {}).filter(([id]) => known.has(id)));
}

/** Every copy one of the member's heroes wears, with the hero wearing it. Selling and refining never use these up. */
export function heroWorn(member: Pick<MemberDoc, 'heroes'> | null | undefined): Map<string, string> {
  const worn = new Map<string, string>();
  for (const [heroId, hero] of Object.entries(member?.heroes ?? {})) {
    for (const slot of HERO_SLOTS) {
      const copyId = hero?.equipment?.[slot];
      if (typeof copyId === 'string' && copyId !== '' && !worn.has(copyId)) worn.set(copyId, heroId);
    }
  }
  return worn;
}

/** The ids of every copy one of the member's heroes wears. */
export const heroCopyIds = (member: Pick<MemberDoc, 'heroes'> | null | undefined): Set<string> => new Set(heroWorn(member).keys());

/**
 * Putting copy `copyId` in hero `heroId`'s `slot`: every other place among the member's heroes it is in
 * now, where it comes off (a copy is on one hero, in one slot), as dotted paths of the member document.
 */
export function heroEquipMoves(heroes: MemberDoc['heroes'], heroId: string, slot: HeroSlot, copyId: string): { from: string[]; elsewhere: string[] } {
  const from: string[] = [];
  const elsewhere: string[] = [];
  for (const [id, hero] of Object.entries(heroes ?? {})) {
    for (const other of HERO_SLOTS) {
      if (id === heroId && other === slot) continue;
      const path = `heroes.${id}.equipment.${other}`;
      if (hero?.equipment?.[other] === copyId) from.push(path);
      else elsewhere.push(path);
    }
  }
  return { from, elsewhere };
}

/** A hero's stats that gear raises (the raid's GearStat, Koma-UI's src/technomagic/sim/types.ts). */

/**
 * Each stat, in the order they're listed: what it is in the raid (`points`: a chance or share, 1000 points
 * being 100%, so a bonus of 0.1 is 100 points; `flat`: added as it is, a unique weapon's ATK, a main unique treasure's
 * HP, TechnoMagic gear's main stat; otherwise a share more of the hero's own), its name among a hero's stats (spelled
 * out: the user's), and its line on a piece of gear.
 */
export const HERO_STATS: Readonly<Record<HeroStat, { points: boolean; flat?: boolean; label: string; text: (value: string) => string }>> = {
  atkFlat: { points: false, flat: true, label: 'Attack', text: (v) => `+${v} ATK` },
  hpFlat: { points: false, flat: true, label: 'Health', text: (v) => `+${v} HP` },
  atk: { points: false, label: 'Attack', text: (v) => `+${v} ATK` },
  hp: { points: false, label: 'Health', text: (v) => `+${v} HP` },
  crit: { points: true, label: 'Critical Chance', text: (v) => `+${v} crit chance` },
  critDamage: { points: false, label: 'Critical Damage', text: (v) => `+${v} crit damage` },
  speed: { points: true, label: 'Attack Speed', text: (v) => `+${v} attack speed` },
  pen: { points: true, label: 'Penetration', text: (v) => `+${v} penetration` },
  defense: { points: false, label: 'Physical and Magical Defense', text: (v) => `+${v} physical and magical defence` },
  defPhysicalFlat: { points: false, flat: true, label: 'Physical Defense', text: (v) => `+${v} P. DEF` },
  defPhysical: { points: false, label: 'Physical Defense', text: (v) => `+${v} physical defence` },
  defMagicalFlat: { points: false, flat: true, label: 'Magical Defense', text: (v) => `+${v} M. DEF` },
  defMagical: { points: false, label: 'Magical Defense', text: (v) => `+${v} magical defence` },
  block: { points: true, label: 'Physical and Magical Block', text: (v) => `+${v} block` },
  blockPhysical: { points: true, label: 'Physical Block', text: (v) => `+${v} physical block` },
  blockMagical: { points: true, label: 'Magical Block', text: (v) => `+${v} magical block` },
  blockDef: { points: true, label: 'Physical and Magical Block Defense', text: (v) => `+${v} block defense` },
  blockDefPhysical: { points: true, label: 'Physical Block Defense', text: (v) => `+${v} physical block defense` },
  blockDefMagical: { points: true, label: 'Magical Block Defense', text: (v) => `+${v} magical block defense` },
  dodge: { points: true, label: 'Dodge', text: (v) => `+${v} dodge` },
  tough: { points: true, label: 'Physical and Magical Tough', text: (v) => `+${v} tough` },
  toughPhysical: { points: true, label: 'Physical Tough', text: (v) => `+${v} physical tough` },
  toughMagical: { points: true, label: 'Magical Tough', text: (v) => `+${v} magical tough` },
  resist: { points: true, label: 'Crowd Control Resistance', text: (v) => `+${v} CC resist` },
  accuracy: { points: true, label: 'Accuracy', text: (v) => `+${v} accuracy` },
  lifesteal: { points: true, label: 'Lifesteal', text: (v) => `+${v} lifesteal` },
  critResist: { points: true, label: 'Critical Resistance', text: (v) => `+${v} crit resist` },
  heal: { points: false, label: 'Heals and Shields', text: (v) => `heals and shields give ${v} more` },
  control: { points: false, label: 'Stun Duration', text: (v) => `stuns on the boss last ${v} longer` },
  manaAttack: { points: false, label: 'Mana per Attack', text: (v) => `+${v} mana per attack` },
  manaRegen: { points: false, label: 'Mana Recovery per Second', text: (v) => `+${v} mana recovery per second` },
};

export const noBonus = (): HeroBonus => Object.fromEntries(HERO_STAT_IDS.map((stat) => [stat, 0])) as HeroBonus;

/**
 * The stat each perk of the raid gear a hero can wear raises, and how much of the perk's strength it gets: by
 * what each does in the raid (the raid's healing and its rallies, guards and boss gimmicks have no like in this
 * raid, so they raise what is nearest).
 */
const FROM_PERK: Partial<Record<EffectId, readonly [HeroStat, number]>> = {
  raidAttack: ['atk', 1],
  raidHp: ['hp', 1],
  raidCritChance: ['crit', 1],
  raidCritDamage: ['critDamage', 1],
  raidSupport: ['heal', 1],
  healBonus: ['heal', 1],
  healSplash: ['heal', 0.5],
  rallyBoost: ['atk', 0.5],
  guardBoost: ['block', 0.5],
  // A share of the boss's max HP a hit (1% at 4 stars) is 150 points of penetration.
  maxHpDamage: ['pen', 15],
  healCut: ['pen', 0.3],
  // Stacks of Blight cleared (1 to 3): 50 points each.
  blightPurge: ['resist', 0.05],
  partyGuard: ['defense', 1],
  warriorCounter: ['block', 0.3],
  circleOfDeath: ['heal', 0.25],
  partyHeal: ['heal', 1],
  rallyCrit: ['crit', 1],
  hexBoost: ['control', 1],
  assassinStrike: ['atk', 0.5],
  assassinCrit: ['crit', 0.5],
  archerRamp: ['speed', 3],
};

/** Whether a hero of `heroClass` gets an item's perks: anyone does, but a class item's only its class. */
export const worksOn = (item: ItemDef, heroClass: RaidClassId): boolean => item.class === undefined || item.class === heroClass;

/**
 * One piece a hero wears: and a TechnoMagic copy's potentials (ItemCopyDoc.tmPotentials), or a unique treasure's options;
 * a TechnoMagic armor's main stat's DEF (`armorDef`: ItemCopyDoc.tmArmorDef); and (`main`) whether it is the hero's main treasure.
 */
export type HeroPiece = GearPiece & { potentials?: readonly TmPotential[]; armorDef?: TmArmorDef; main?: boolean };

/** A copy's main stat as the pages show it (data/tm-main.ts): TechnoMagic gear's, by its item and its copy's armor DEF (null: none). */
export function copyMainStat(item: ItemDef, copy: Partial<Pick<ItemCopyDoc, 'tmArmorDef'>>): MainStat | null {
  const main = tmMainStat(item, copy.tmArmorDef);
  return main && { name: main.name, value: main.value };
}

/** The class of the hero a unique weapon is for (undefined: not one, or of a hero that's gone). */
export const uniqueClass = (item: ItemDef): RaidClassId | undefined => (item.uniqueWeapon === undefined ? undefined : HEROES.find((hero) => hero.id === item.uniqueWeapon)?.class);

/**
 * What one piece gives a hero of `heroClass`, stat by stat (nothing from a class item of another class); and,
 * when `heroId` says which hero, nothing from another hero's unique weapon. A unique weapon's flat ATK is its
 * own hero's class's.
 */
export function pieceBonus({ item, level, potentials = [], armorDef, main = false }: HeroPiece, heroClass: RaidClassId, heroId?: string): HeroBonus {
  const out = noBonus();
  if (!worksOn(item, heroClass) || (heroId !== undefined && !wieldedBy(item, heroId))) return out;
  for (const effect of itemEffects(item, level)) {
    const to = FROM_PERK[effect];
    if (to) out[to[0]] += effectStrength(effect, item.stars) * perkShare(effect, level) * to[1];
  }
  const owner = uniqueClass(item);
  if (owner) out.atkFlat += uwAttack(owner, level);
  // (A unique treasure's HP: King's Raid's, the same for every hero, and only as its main treasure.)
  if (item.uniqueTreasure && main) out.hpFlat += utHp(level);
  // (TechnoMagic gear's potentials, and a unique treasure's options, wherever it is worn.)
  if (item.tmDrop || item.uniqueTreasure) for (const { stat, value } of potentials) if (stat in out) out[stat] += value;
  // (TechnoMagic gear's main stat, King's Raid's at 5★: a weapon's HP, an armor's DEF.)
  const mainStat = tmMainStat(item, armorDef);
  if (mainStat) out[mainStat.stat] += mainStat.value;
  return out;
}

/** What every piece a hero wears gives it, all told (by `heroId`: see pieceBonus). */
export function heroBonus(pieces: readonly HeroPiece[], heroClass: RaidClassId, heroId?: string): HeroBonus {
  const out = noBonus();
  for (const piece of pieces) {
    const one = pieceBonus(piece, heroClass, heroId);
    for (const stat of HERO_STAT_IDS) out[stat] += one[stat];
  }
  return out;
}

/** How much of a stat, as its lines say it: a share (a percent), or flat ATK as it is. */
const amount = (stat: HeroStat, value: number): string => (HERO_STATS[stat].flat ? fmt(Math.round(value)) : formatPercent(value));

/** A stat's line on a piece of gear, by how much, like "+25% ATK" or "+96,209 ATK". */
export const statLine = (stat: HeroStat, value: number): string => HERO_STATS[stat].text(amount(stat, value));

/** One line for each stat a bonus raises, in HERO_STATS' order, like "+25% ATK". */
export const bonusLines = (bonus: HeroBonus): string[] => HERO_STAT_IDS.filter((stat) => bonus[stat] > 1e-9).map((stat) => statLine(stat, bonus[stat]));

/** A hero's stats, all its gear gives it, a line for each stat it raises (its name spelled out), like "+25% Attack". */
export const heroStatLines = (bonus: HeroBonus): string[] => HERO_STAT_IDS.filter((stat) => bonus[stat] > 1e-9).map((stat) => `+${amount(stat, bonus[stat])} ${HERO_STATS[stat].label}`);

/** Points in the raid that are 100% (10 to 1%): a chance or share's bonus of 0.1 is 100 of them. */
const POINTS = 1000;

/**
 * What a hero's perks (data/transcend.ts ids: those it has picked, as far as it is transcended) give its stats, a line
 * each as its other stats' lines (spelled out), like "+30% Attack": the raid's perks (vendor/technomagic-sim.mjs), its
 * own and its share of what they give every ally; and Offensive Guard's ATK from its physical defense last.
 */
export function perkLines(heroId: string, perks: readonly string[]): string[] {
  const stats = tmPerkStats(heroId, perks);
  if (!stats) return [];
  const shares = noBonus();
  for (const [stat, value] of Object.entries(stats.bonus)) {
    if (stat in HERO_STATS) shares[stat as HeroStat] += HERO_STATS[stat as HeroStat].points ? value / POINTS : value;
  }
  return [...heroStatLines(shares), ...(stats.atkFromDefense > 0 ? [`+${HERO_STATS.atk.label} equal to ${formatPercent(stats.atkFromDefense)} of ${HERO_STATS.defPhysical.label}`] : [])];
}

/** A TechnoMagic copy's potentials, a line each, like "+5% ATK Spd" (none for a copy that has none). */
export const potentialLines = (potentials: readonly TmPotential[] | undefined): string[] =>
  (potentials ?? []).flatMap(({ stat, value }) => {
    const name = TM_POTENTIAL_NAME.get(stat);
    return name ? [`+${formatPercent(value)} ${name}`] : [];
  });

/**
 * What a copy of `item` at `level` does on a hero, a line for each stat it raises: on any hero (left
 * out), or on one of `heroClass`, which for a class item of another class is nothing. A unique weapon's on
 * its own hero, with its own effect at that level last. A TechnoMagic copy's are its `potentials`, a line each.
 */
export function heroItemLines(item: ItemDef, level: number = REFINE.maxLevel, heroClass?: RaidClassId, potentials?: readonly TmPotential[]): string[] {
  if (item.tmDrop) return potentialLines(potentials);
  if (item.uniqueTreasure) {
    const owner = HEROES.find((hero) => hero.id === item.uniqueTreasure?.hero);
    const effect = owner ? uniqueTreasureText(owner.id, item.uniqueTreasure.skill, treasureTier(level)) : null;
    return [...potentialLines(potentials), `As main treasure: ${statLine('hpFlat', utHp(level))}`, ...(owner && effect ? [`${owner.name} only, as main treasure, ★${treasureTier(level)}: ${effect.text}`] : [])];
  }
  const owner = item.uniqueWeapon === undefined ? undefined : HEROES.find((hero) => hero.id === item.uniqueWeapon);
  const lines = bonusLines(pieceBonus({ item, level }, heroClass ?? owner?.class ?? item.class ?? 'knight'));
  const unique = owner ? uniqueWeaponText(owner.id, uniqueTier(level)) : null;
  return unique ? [...lines, `${owner?.name} only, ★${uniqueTier(level)}: ${unique}`] : lines;
}

/** Whether a stat is points in the raid (see HERO_STATS); its bonus as the raid counts it: points, or a share (or flat ATK, as it is). */
export const raidValue = (stat: HeroStat, share: number): number => (HERO_STATS[stat].points ? Math.round(share * POINTS) : HERO_STATS[stat].flat ? Math.round(share) : share);

/**
 * Whether a piece counts on a hero, its unique treasures counted so far being `treasures` (item ids): any piece does but
 * a second copy of the same unique treasure (it is added to them).
 */
export function countsOnce(item: ItemDef, treasures: Set<string>): boolean {
  if (item.uniqueTreasure === undefined) return true;
  if (treasures.has(item.id)) return false;
  treasures.add(item.id);
  return true;
}

/** The TechnoMagic set a hero's weapons and armors are most of (each working on its class), and how many of them: null with none. */
export function heroSet(pieces: readonly Pick<GearPiece, 'item'>[], heroClass: RaidClassId): { set: TmSetId; pieces: number } | null {
  const counts = new Map<TmSetId, number>();
  for (const { item } of pieces) {
    if (item.tmSet && item.slot !== 'treasure' && worksOn(item, heroClass)) counts.set(item.tmSet, (counts.get(item.tmSet) ?? 0) + 1);
  }
  let best: { set: TmSetId; pieces: number } | null = null;
  for (const [set, count] of counts) if (!best || count > best.pieces) best = { set, pieces: count };
  return best;
}

/** The set whose effect a hero has: TM_SET_PIECES of its pieces worn (null: none). */
export const activeSet = (found: { set: TmSetId; pieces: number } | null): TmSetId | null => (found && found.pieces >= TM_SET_PIECES ? found.set : null);

/** A hero's set, as the heroes page says it: what it does for its class once whole (nothing for part of one). */
export function setLines(found: { set: TmSetId; pieces: number } | null, heroClass: RaidClassId): string[] {
  const set = found && TM_SETS_BY_ID.get(found.set);
  if (!found || !set || found.pieces < TM_SET_PIECES) return [];
  return [`${set.emoji} **${set.name} set**: ${set.effects[heroClass] ?? 'nothing for this class'}`];
}

/**
 * What a hero takes into a TechnoMagic Raid run: its gear's stats, its set (null: none), its own unique weapon's
 * tier (null: none worn), its main treasure when it is one of its own unique treasures (which, 1 to 4, at which tier;
 * null: none), and the additional skill of each piece of TechnoMagic gear it wears.
 */
export interface RaidGear {
  bonus: HeroBonus;
  set: TmSetId | null;
  uw: number | null;
  ut: { skill: number; tier: number } | null;
  skills: string[];
  /** The ids of the copies it wears that count (as the raid counts them). */
  copies: string[];
}

/** The additional skills a hero has of the copies it wears: each TechnoMagic piece's that works on its class (as its stats do). */
export const heroSkills = (pieces: readonly { item: ItemDef; skill?: string }[], heroClass: RaidClassId): string[] =>
  pieces.filter(({ item, skill }) => item.tmDrop && skill && worksOn(item, heroClass)).map(({ skill }) => skill as string);

/**
 * What each of the member's heroes' gear gives it in the raid, as the raid counts it (raidValue: points for a
 * chance or share, a share for the rest), the TechnoMagic set whose effect it has, its own unique weapon's
 * tier, its main unique treasure, and its TechnoMagic gear's additional skills, by hero id: the gear a TechnoMagic Raid
 * run is played with. Only copies they still own, in a slot they fit (heroSlotsFor), on that hero, a unique weapon or
 * treasure only on its own hero, each unique treasure once (a second copy of one counts for nothing), and sub treasures
 * only under a main one that is a unique treasure (as the heroes page shows them).
 */
export function raidGear(copies: readonly (Pick<ItemCopyDoc, '_id' | 'itemId' | 'level' | 'tmSkill' | 'tmPotentials'> & Partial<Pick<ItemCopyDoc, 'tmArmorDef'>>)[], member: Pick<MemberDoc, 'heroes'> | null): Map<string, RaidGear> {
  const owned = new Map(copies.map((copy) => [copy._id, copy]));
  const worn = heroWorn(member);
  const out = new Map<string, RaidGear>();
  for (const hero of HEROES) {
    const doc = member?.heroes?.[hero.id];
    if (!doc) continue;
    const on: HeroPiece[] = [];
    const skilled: { item: ItemDef; skill?: string }[] = [];
    const counted: string[] = [];
    let uw: number | null = null;
    let ut: RaidGear['ut'] = null;
    const treasures = new Set<string>();
    for (const slot of HERO_SLOTS) {
      const copy = owned.get(doc.equipment?.[slot] ?? '');
      const item = copy && ITEMS_BY_ID.get(copy.itemId);
      // (A unique weapon only counts in UNIQUE_SLOT: one put in a second weapon slot before that rule does nothing.)
      if (!copy || !item || !heroWearable(item) || !wieldedBy(item, hero.id) || !fitsSlot(item, slot) || worn.get(copy._id) !== hero.id) continue;
      // (A sub treasure only under a main one that is a unique treasure: the treasure slot comes first.)
      if (SIDE_SLOTS.includes(slot) && ut === null) continue;
      if (!countsOnce(item, treasures)) continue;
      if (item.uniqueWeapon !== undefined) uw = uniqueTier(copy.level);
      if (item.uniqueTreasure !== undefined && slot === 'treasure') ut = { skill: item.uniqueTreasure.skill, tier: treasureTier(copy.level) };
      on.push({ item, level: refineLevel(copy.level), ...(copy.tmPotentials && { potentials: copy.tmPotentials }), ...(copy.tmArmorDef && { armorDef: copy.tmArmorDef }), ...(slot === 'treasure' && { main: true }) });
      skilled.push({ item, ...(copy.tmSkill !== undefined && { skill: copy.tmSkill }) });
      counted.push(copy._id);
    }
    const shares = heroBonus(on, hero.class, hero.id);
    out.set(hero.id, {
      bonus: Object.fromEntries(HERO_STAT_IDS.map((stat) => [stat, raidValue(stat, shares[stat])])) as HeroBonus,
      set: activeSet(heroSet(on, hero.class)),
      uw,
      ut,
      skills: heroSkills(skilled, hero.class),
      copies: counted,
    });
  }
  return out;
}

/**
 * Whether a TechnoMagic copy's set effect, and its additional effect, are on: what the heroes and gear pages light
 * up. And whether it works on the hero wearing it at all (`works`: a hero of its class; on another, none of it
 * counts, not even its stats).
 */
export interface TmEffectsOn {
  set: boolean;
  additional: boolean;
  works: boolean;
}

/**
 * Which of the member's TechnoMagic copies' effects are on, by copy id (a copy not in it has neither on): a
 * copy's additional effect is on while a hero of its class wears it, and its set effect while that hero also
 * has its set's effect (TM_SET_PIECES of it worn). As the raid counts them (raidGear).
 */
export function activeTmEffects(copies: Parameters<typeof raidGear>[0], member: Parameters<typeof raidGear>[1]): Map<string, TmEffectsOn> {
  const byId = new Map(copies.map((copy) => [copy._id, copy]));
  const out = new Map<string, TmEffectsOn>();
  for (const [heroId, gear] of raidGear(copies, member)) {
    const hero = HEROES.find((one) => one.id === heroId);
    for (const id of gear.copies) {
      const copy = byId.get(id);
      const item = copy && ITEMS_BY_ID.get(copy.itemId);
      if (!hero || !copy || !item?.tmDrop) continue;
      const works = worksOn(item, hero.class);
      out.set(id, { set: works && item.slot !== 'treasure' && item.tmSet !== undefined && item.tmSet === gear.set, additional: works && copy.tmSkill !== undefined, works });
    }
  }
  return out;
}

/** What each of the member's heroes' gear gives it in the raid, by hero id (raidGear's, without the sets). */
export const raidBonuses = (copies: Parameters<typeof raidGear>[0], member: Parameters<typeof raidGear>[1]): Map<string, HeroBonus> =>
  new Map([...raidGear(copies, member)].map(([id, { bonus }]) => [id, bonus]));
