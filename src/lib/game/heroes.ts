import { REFINE } from '../../constants/index.js';
import type { RaidClassId } from '../../constants/raid.js';
import { HEROES } from '../../data/heroes.js';
import { ITEMS_BY_ID, uniqueOwner } from '../../data/items.js';
import { ARTIFACT_TEXT, KR_MAIN_NAME, KR_RUNES_BY_ID, KR_SETS, KR_TM_SETS, krMainValue, krOptionValue, krWornBy, UW_RUNES } from '../../data/kr-gear.js';
import { tmMainStat } from '../../data/tm-main.js';
import { TM_POTENTIAL_NAME } from '../../data/tm-potentials.js';
import { TM_SET_PIECES, TM_SETS_BY_ID } from '../../data/tm-sets.js';
import { uwAttack } from '../../data/uw-attack.js';
import { utHp } from '../../data/ut-hp.js';
import { HERO_SLOTS, type HeroDoc, type HeroSlot, type ItemCopyDoc, type ItemDef, type KrOption, type MemberDoc, type TmArmorDef, type TmPotential, type TmSetId } from '../../types.js';
import { fmt, formatPercent } from '../format.js';
import type { GearPiece } from './items/equipment.js';
import { refineLevel } from './items/refine-share.js';
import { tmPerkStats, uniqueTreasureText, uniqueWeaponText } from '../../../vendor/technomagic-sim.mjs';
import { HERO_PART_NAME, HERO_SLOT_PART, SIDE_SLOTS, type HeroPart } from '../../protocol/heroes.js';
import { HERO_STAT_IDS, type HeroBonus, type HeroStat } from '../../protocol/heroes.js';
import type { MainStat } from '../../protocol/items.js';

export { HERO_SLOT_PART, HERO_STAT_IDS, SIDE_SLOTS, type HeroBonus, type HeroStat };

/*
 * The TechnoMagic Raid's heroes (data/heroes.ts), with no database: which gear they wear, where, and what it does for them in
 * the raid. A hero wears King's Raid's hero gear (data/kr-gear.ts: ItemDef.kr), as King's Raid's heroes do: a Weapon (its own
 * unique weapon, or a dragon set's), Armor, Mantle, Accessory and Orb, a Treasure with three sub treasures, and an
 * Artifact; never the members' own gear. A copy can be on one hero only, in one slot.
 *
 * What gear does for a hero is its stats in the raid (the raid's own, Koma-UI's src/technomagic/): a piece's main stat at its
 * refinement (King's Raid's, added as it is), its options and the runes in its sockets (each raising the stat of its name), and
 * its set's bonuses: a dragon set's stats for 2 and 4 of its pieces worn, a TechnoMagic set's skill for 4 (the raid's: the set
 * is said to it). A piece only works on a hero of its classes. A hero's unique weapon (ItemDef.uniqueWeapon) only goes on its
 * own hero, in its weapon slot: it adds King's Raid's flat ATK for its hero's class and refinement (data/uw-attack.ts), has
 * its own effect in the raid (uniqueWeaponText) and three rune sockets. A hero's unique treasures (ItemDef.uniqueTreasure) only
 * go on their own hero too: one in its treasure slot (its main treasure), and up to three more in its sub treasure slots, each
 * a different one, only while its main treasure is one of them. Wherever it is, a unique treasure gives its options (its copy's
 * tmPotentials); only the main one has its HP and its effect in the raid (uniqueTreasureText). An artifact's effect is the
 * raid's (vendor's TM_ARTIFACTS): the raid is told which, at its refinement.
 */

/** The one slot a unique weapon goes in: a hero's weapon slot. */
export const UNIQUE_SLOT: HeroSlot = 'weapon';

/** The part of a hero's gear an item is (null: none: not hero gear). */
export function partOf(item: Pick<ItemDef, 'kr' | 'uniqueWeapon' | 'uniqueTreasure'>): HeroPart | null {
  if (item.uniqueWeapon !== undefined) return 'weapon';
  if (item.uniqueTreasure !== undefined) return 'treasure';
  return item.kr?.part ?? null;
}

/** The hero's slots an item fits in: its part's (a unique treasure's, the treasure slot and the sub treasure slots). */
export const heroSlotsFor = (item: Pick<ItemDef, 'kr' | 'uniqueWeapon' | 'uniqueTreasure'>): HeroSlot[] => {
  const part = partOf(item);
  if (part === null) return [];
  return item.uniqueTreasure !== undefined ? ['treasure', ...SIDE_SLOTS] : HERO_SLOTS.filter((slot) => HERO_SLOT_PART[slot] === part && !SIDE_SLOTS.includes(slot));
};

/** Whether an item goes in a hero's `slot` (heroSlotsFor). */
export const fitsSlot = (item: Pick<ItemDef, 'kr' | 'uniqueWeapon' | 'uniqueTreasure'>, slot: HeroSlot): boolean => heroSlotsFor(item).includes(slot);

/** Whether a hero can wear an item at all: King's Raid's hero gear, artifacts, and the unique weapons and treasures (each only on its own hero: wieldedBy). */
export const heroWearable = (item: ItemDef): boolean => item.kr !== undefined || uniqueOwner(item) !== undefined;

/** Whether only heroes wear an item (the member can't): hero gear (the old TechnoMagic gear too), and the unique weapons and treasures. */
export const heroOnly = (item: ItemDef): boolean => item.kr !== undefined || item.tmDrop === true || uniqueOwner(item) !== undefined;

/** Whether an item is a hero's T10 gear (King's Raid's top tier): a unique weapon or treasure, or an artifact. */
export const topTier = (item: ItemDef): boolean => uniqueOwner(item) !== undefined || item.kr?.tier === 10;

/** Whether a copy of an item locks by itself as it is got or refined: the members' own 4★ gear, but of a hero's gear only its T10 (topTier). */
export const autoLocked = (item: ItemDef): boolean => (heroOnly(item) ? topTier(item) : item.stars === 4);

/** Whether hero `heroId` may wear an item: any of them, but a unique weapon or treasure only its own. */
export const wieldedBy = (item: ItemDef, heroId: string): boolean => {
  const owner = uniqueOwner(item);
  return owner === undefined || owner === heroId;
};

/** A unique treasure's tier in the raid: its copy's stars (0★ to 5★, Koma-UI's sim/treasures.ts). */
export const treasureTier = (level: number): number => refineLevel(level, 0);

/** A unique weapon's tier in the raid: its copy's stars (0★ to 5★, Koma-UI's sim/unique.ts). */
export const uniqueTier = (level: number): number => refineLevel(level, 0);

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

/**
 * Each stat, in the order they're listed: what it is in the raid (`points`: a chance or share, 1000 points
 * being 100%, so a bonus of 0.1 is 100 points; `flat`: added as it is, a unique weapon's ATK, a main unique treasure's
 * HP, a piece's main stat; otherwise a share more of the hero's own), its name among a hero's stats (spelled
 * out: the user's), its name on a piece of gear (King's Raid's), and its line on a piece of gear.
 */
export const HERO_STATS: Readonly<Record<HeroStat, { points: boolean; flat?: boolean; label: string; short: string; text: (value: string) => string }>> = {
  atkFlat: { points: false, flat: true, label: 'Attack', short: 'ATK', text: (v) => `+${v} ATK` },
  hpFlat: { points: false, flat: true, label: 'Health', short: 'HP', text: (v) => `+${v} HP` },
  atk: { points: false, label: 'Attack', short: 'ATK', text: (v) => `+${v} ATK` },
  hp: { points: false, label: 'Health', short: 'Max HP', text: (v) => `+${v} HP` },
  crit: { points: true, label: 'Critical Chance', short: 'Crit', text: (v) => `+${v} crit chance` },
  critDamage: { points: false, label: 'Critical Damage', short: 'Crit DMG', text: (v) => `+${v} crit damage` },
  speed: { points: true, label: 'Attack Speed', short: 'ATK Spd', text: (v) => `+${v} attack speed` },
  pen: { points: true, label: 'Penetration', short: 'Penetration', text: (v) => `+${v} penetration` },
  acc: { points: true, label: 'Accuracy', short: 'ACC', text: (v) => `+${v} ACC` },
  defense: { points: false, label: 'Physical and Magic Defense', short: 'All DEF', text: (v) => `+${v} physical and magic defence` },
  defPhysicalFlat: { points: false, flat: true, label: 'Physical Defense', short: 'P. DEF', text: (v) => `+${v} P. DEF` },
  defPhysical: { points: false, label: 'Physical Defense', short: 'P. DEF', text: (v) => `+${v} physical defence` },
  defMagicalFlat: { points: false, flat: true, label: 'Magic Defense', short: 'M. DEF', text: (v) => `+${v} M. DEF` },
  defMagical: { points: false, label: 'Magic Defense', short: 'M. DEF', text: (v) => `+${v} magic defence` },
  block: { points: true, label: 'Physical and Magic Block', short: 'All Block', text: (v) => `+${v} block` },
  blockPhysical: { points: true, label: 'Physical Block', short: 'P. Block', text: (v) => `+${v} physical block` },
  blockMagical: { points: true, label: 'Magic Block', short: 'M. Block', text: (v) => `+${v} magic block` },
  blockDef: { points: true, label: 'Physical and Magic Block Defense', short: 'Block DEF', text: (v) => `+${v} block defense` },
  blockDefPhysical: { points: true, label: 'Physical Block Defense', short: 'P. Block DEF', text: (v) => `+${v} physical block defense` },
  blockDefMagical: { points: true, label: 'Magic Block Defense', short: 'M. Block DEF', text: (v) => `+${v} magic block defense` },
  dodge: { points: true, label: 'Dodge', short: 'Dodge', text: (v) => `+${v} dodge` },
  dodgePhysical: { points: true, label: 'Physical Dodge', short: 'P. Dodge', text: (v) => `+${v} physical dodge` },
  dodgeMagical: { points: true, label: 'Magic Dodge', short: 'M. Dodge', text: (v) => `+${v} magic dodge` },
  tough: { points: true, label: 'Physical and Magic Tough', short: 'Tough', text: (v) => `+${v} tough` },
  toughPhysical: { points: true, label: 'Physical Tough', short: 'P. Tough', text: (v) => `+${v} physical tough` },
  toughMagical: { points: true, label: 'Magic Tough', short: 'M. Tough', text: (v) => `+${v} magic tough` },
  resist: { points: true, label: 'Crowd Control Resistance', short: 'CC Resist', text: (v) => `+${v} CC resist` },
  accuracy: { points: true, label: 'Crowd Control Accuracy', short: 'CC ACC', text: (v) => `+${v} CC ACC` },
  lifesteal: { points: true, label: 'Lifesteal', short: 'Lifesteal', text: (v) => `+${v} lifesteal` },
  critResist: { points: true, label: 'Critical Resistance', short: 'Crit Resist', text: (v) => `+${v} crit resist` },
  critResistPhysical: { points: true, label: 'Physical Critical Resistance', short: 'P. Crit Resist', text: (v) => `+${v} physical crit resist` },
  critResistMagical: { points: true, label: 'Magic Critical Resistance', short: 'M. Crit Resist', text: (v) => `+${v} magic crit resist` },
  heal: { points: false, label: 'Heals and Shields', short: 'Heal Rate', text: (v) => `heals and shields give ${v} more` },
  recovery: { points: false, label: 'Recovery', short: 'Recovery', text: (v) => `+${v} recovery` },
  control: { points: false, label: 'Stun Duration', short: 'Stun Duration', text: (v) => `stuns on the boss last ${v} longer` },
  manaAttack: { points: false, label: 'Mana per Attack', short: 'MP Recovery/Attack', text: (v) => `+${v} mana per attack` },
  manaRegen: { points: false, label: 'Mana Recovery per Second', short: 'MP Recovery/Sec', text: (v) => `+${v} mana recovery per second` },
  manaDamage: { points: false, label: 'Mana from Damage Taken', short: 'MP Recovery/Damage', text: (v) => `+${v} mana from damage taken` },
};

export const noBonus = (): HeroBonus => Object.fromEntries(HERO_STAT_IDS.map((stat) => [stat, 0])) as HeroBonus;

/** Whether a hero of `heroClass` gets anything of an item: King's Raid's gear only its classes; another class item only its class. */
export const worksOn = (item: ItemDef, heroClass: RaidClassId): boolean => (item.kr ? krWornBy(item.kr, heroClass) : item.class === undefined || item.class === heroClass);

/**
 * One piece a hero wears: and a unique treasure's options (ItemCopyDoc.tmPotentials); King's Raid's gear's options and the
 * runes in its sockets (a unique weapon's runes too); and (`main`) whether it is the hero's main treasure.
 */
export type HeroPiece = GearPiece & { potentials?: readonly TmPotential[]; options?: readonly KrOption[]; runes?: readonly (string | null)[]; main?: boolean };

/** How much of a stat as its line says it: a share (a percent), or flat as it is. */
const amount = (stat: HeroStat, value: number): string => (HERO_STATS[stat].flat ? fmt(Math.round(value)) : formatPercent(value));

/**
 * A copy's main stat as the pages show it, at its stars: King's Raid's gear's; a unique weapon's ATK (for its hero's class)
 * and a unique treasure's HP (as its hero's main treasure: King's Raid's); the old TechnoMagic gear's, by its copy's armor
 * DEF. Null: none (an artifact).
 */
export function copyMainStat(item: ItemDef, copy: Partial<Pick<ItemCopyDoc, 'tmArmorDef' | 'level'>>): MainStat | null {
  const stars = refineLevel(copy.level ?? 1, 0);
  if (item.kr?.main) return { name: KR_MAIN_NAME[item.kr.main[0]], value: krMainValue(item.kr, stars) };
  const owner = uniqueClass(item);
  if (owner) return { name: KR_MAIN_NAME.atk, value: uwAttack(owner, stars) };
  if (item.uniqueTreasure) return { name: KR_MAIN_NAME.hp, value: utHp(stars) };
  const main = tmMainStat(item, copy.tmArmorDef);
  return main && { name: main.name, value: main.value };
}

/** The class of the hero a unique weapon is for (undefined: not one, or of a hero that's gone). */
export const uniqueClass = (item: ItemDef): RaidClassId | undefined => (item.uniqueWeapon === undefined ? undefined : HEROES.find((hero) => hero.id === item.uniqueWeapon)?.class);

/** What the runes in a piece's sockets give, stat by stat (shares). */
export function runeBonus(runes: readonly (string | null)[] | undefined): Partial<Record<HeroStat, number>> {
  const out: Partial<Record<HeroStat, number>> = {};
  for (const id of runes ?? []) {
    const rune = id ? KR_RUNES_BY_ID.get(id) : undefined;
    for (const [stat, value] of Object.entries(rune?.stats ?? {})) if (stat in HERO_STATS) out[stat as HeroStat] = (out[stat as HeroStat] ?? 0) + (value as number);
  }
  return out;
}

/** How many rune sockets a piece has (a unique weapon's three; none for anything else). */
export const socketsOf = (item: ItemDef): number => (item.uniqueWeapon !== undefined ? UW_RUNES : (item.kr?.runes ?? 0));

/**
 * What one piece gives a hero of `heroClass`, stat by stat (nothing from a piece not of its class); and, when `heroId` says
 * which hero, nothing from another hero's unique weapon or treasure. (Its set's bonuses are the hero's: heroSetBonus.)
 */
export function pieceBonus({ item, level, potentials = [], options = [], runes = [], main = false }: HeroPiece, heroClass: RaidClassId, heroId?: string): HeroBonus {
  const out = noBonus();
  if (!worksOn(item, heroClass) || (heroId !== undefined && !wieldedBy(item, heroId))) return out;
  const owner = uniqueClass(item);
  if (owner) out.atkFlat += uwAttack(owner, level);
  // (A unique treasure's HP: King's Raid's, the same for every hero, and only as its main treasure; its options wherever it is.)
  if (item.uniqueTreasure && main) out.hpFlat += utHp(level);
  if (item.uniqueTreasure) for (const { stat, value } of potentials) if (stat in out) out[stat] += value;
  const kr = item.kr;
  if (kr) {
    // (Its main stat at its refinement, as it is; its options; an artifact's is the raid's.)
    if (kr.main) {
      const [stat, base] = kr.main;
      const value = krMainValue(kr, level);
      if (base > 0) out[stat === 'atk' ? 'atkFlat' : stat === 'hp' ? 'hpFlat' : stat === 'defPhysical' ? 'defPhysicalFlat' : 'defMagicalFlat'] += value;
    }
    for (const option of options) if (option.stat in out) out[option.stat as HeroStat] += krOptionValue(kr, option);
  }
  if (socketsOf(item) > 0) for (const [stat, value] of Object.entries(runeBonus(runes))) out[stat as HeroStat] += value;
  return out;
}

/** What every piece a hero wears gives it, all told, its sets' bonuses with them (by `heroId`: see pieceBonus). */
export function heroBonus(pieces: readonly HeroPiece[], heroClass: RaidClassId, heroId?: string): HeroBonus {
  const out = noBonus();
  for (const piece of pieces) {
    const one = pieceBonus(piece, heroClass, heroId);
    for (const stat of HERO_STAT_IDS) out[stat] += one[stat];
  }
  for (const [stat, value] of Object.entries(heroSetBonus(pieces, heroClass))) out[stat as HeroStat] += value;
  return out;
}

/** A stat's line on a piece of gear, by how much, like "+25% ATK" or "+96,209 ATK". */
export const statLine = (stat: HeroStat, value: number): string => HERO_STATS[stat].text(amount(stat, value));

/** A stat's line as King's Raid's gear says it, like "ATK +14%" or "Crit +150". */
export const krLine = (stat: HeroStat, value: number): string =>
  `${HERO_STATS[stat].short} +${HERO_STATS[stat].flat ? fmt(Math.round(value)) : HERO_STATS[stat].points ? fmt(Math.round(value * POINTS)) : formatPercent(value)}`;

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

/** A unique treasure's options, a line each, like "+5% ATK Spd" (none for a copy that has none). */
export const potentialLines = (potentials: readonly TmPotential[] | undefined): string[] =>
  (potentials ?? []).flatMap(({ stat, value }) => {
    const name = TM_POTENTIAL_NAME.get(stat);
    return name ? [`+${formatPercent(value)} ${name}`] : [];
  });

/** A King's Raid piece's options, a line each, like "ATK +14%". */
export const optionLines = (item: ItemDef, options: readonly KrOption[] | undefined): string[] =>
  item.kr ? (options ?? []).flatMap((option) => (option.stat in HERO_STATS ? [krLine(option.stat as HeroStat, krOptionValue(item.kr as NonNullable<ItemDef['kr']>, option))] : [])) : [];

/** What a rune gives, a line each, like "ATK +15%". */
export const runeLines = (id: string): string[] =>
  Object.entries(KR_RUNES_BY_ID.get(id)?.stats ?? {}).flatMap(([stat, value]) => (stat in HERO_STATS ? [krLine(stat as HeroStat, value as number)] : []));

/**
 * What a copy of `item` at `level` does on a hero, a line each: King's Raid's gear's options (`options`) and its runes'
 * (`runes`), an artifact's effect at its tier; a unique treasure's options (`potentials`) and its effect as main treasure;
 * a unique weapon's runes and its own effect. Never its main stat (copyMainStat: the pages show it above these).
 */
export function heroItemLines(
  item: ItemDef,
  level: number = REFINE.maxLevel,
  potentials?: readonly TmPotential[],
  options?: readonly KrOption[],
  runes?: readonly (string | null)[],
): string[] {
  const runeText = (runes ?? []).flatMap((id) => (id ? runeLines(id) : []));
  if (item.kr?.part === 'artifact') {
    // (Its texts are by its stars, 0★ to 5★.)
    const text = ARTIFACT_TEXT.get(item.id)?.[refineLevel(level, 0)];
    return text ? [text] : [];
  }
  if (item.kr) return [...optionLines(item, options), ...runeText];
  if (item.uniqueTreasure) {
    const owner = HEROES.find((hero) => hero.id === item.uniqueTreasure?.hero);
    const effect = owner ? uniqueTreasureText(owner.id, item.uniqueTreasure.skill, treasureTier(level)) : null;
    return [...potentialLines(potentials), ...(owner && effect ? [`${owner.name} only, as main treasure, ★${treasureTier(level)}: ${effect.text}`] : [])];
  }
  if (item.tmDrop) return potentialLines(potentials);
  const owner = item.uniqueWeapon === undefined ? undefined : HEROES.find((hero) => hero.id === item.uniqueWeapon);
  const unique = owner ? uniqueWeaponText(owner.id, uniqueTier(level)) : null;
  return unique ? [...runeText, `${owner?.name} only, ★${uniqueTier(level)}: ${unique}`] : runeText;
}

/** Whether a stat is points in the raid (see HERO_STATS); its bonus as the raid counts it: points, or a share (or flat, as it is). */
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

/** How many pieces of each set a hero wears (each working on its class). */
export function setCounts(pieces: readonly Pick<GearPiece, 'item'>[], heroClass: RaidClassId): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { item } of pieces) {
    const set = item.kr?.set;
    if (set && worksOn(item, heroClass)) counts.set(set, (counts.get(set) ?? 0) + 1);
  }
  return counts;
}

/** What a dragon set's bonuses give a hero wearing `pieces` of it: its 2-piece stats from 2, and its 4-piece ones too from 4. */
export function dragonSetBonus(set: string, pieces: number): Partial<Record<HeroStat, number>> {
  const data = KR_SETS[set];
  const out: Partial<Record<HeroStat, number>> = {};
  if (!data || KR_TM_SETS.includes(set)) return out;
  const add = (stats: object | undefined): void => {
    for (const [stat, value] of Object.entries(stats ?? {})) if (typeof value === 'number' && stat in HERO_STATS) out[stat as HeroStat] = (out[stat as HeroStat] ?? 0) + value;
  };
  if (pieces >= 2) add(data.two);
  if (pieces >= 4) add(data.four);
  return out;
}

/** What the dragon sets a hero wears give it, stat by stat. */
export function heroSetBonus(pieces: readonly Pick<GearPiece, 'item'>[], heroClass: RaidClassId): Partial<Record<HeroStat, number>> {
  const out: Partial<Record<HeroStat, number>> = {};
  for (const [set, count] of setCounts(pieces, heroClass)) {
    for (const [stat, value] of Object.entries(dragonSetBonus(set, count))) out[stat as HeroStat] = (out[stat as HeroStat] ?? 0) + value;
  }
  return out;
}

/** The TechnoMagic set a hero's gear is most of (each working on its class), and how many of them: null with none. */
export function heroSet(pieces: readonly Pick<GearPiece, 'item'>[], heroClass: RaidClassId): { set: TmSetId; pieces: number } | null {
  let best: { set: TmSetId; pieces: number } | null = null;
  for (const [set, count] of setCounts(pieces, heroClass)) {
    if (KR_TM_SETS.includes(set) && (!best || count > best.pieces)) best = { set: set as TmSetId, pieces: count };
  }
  return best;
}

/** The set whose effect a hero has: TM_SET_PIECES of its pieces worn (null: none). */
export const activeSet = (found: { set: TmSetId; pieces: number } | null): TmSetId | null => (found && found.pieces >= TM_SET_PIECES ? found.set : null);

/** A set's bonuses as lines, for a hero wearing `pieces` of it (or none: all of them), and whether each is on. */
export function setBonusLines(set: string, heroClass: RaidClassId | null, pieces: number): { pieces: number; text: string; active: boolean }[] {
  const data = KR_SETS[set];
  if (!data) return [];
  const statsLine = (stats: object | undefined): string =>
    Object.entries(stats ?? {})
      .flatMap(([stat, value]) => (stat in HERO_STATS && typeof value === 'number' ? [krLine(stat as HeroStat, value)] : []))
      .join(', ');
  if (KR_TM_SETS.includes(set)) {
    const effect = heroClass ? TM_SETS_BY_ID.get(set as TmSetId)?.effects[heroClass] : undefined;
    return [{ pieces: TM_SET_PIECES, text: effect ?? 'nothing for its class', active: pieces >= TM_SET_PIECES }];
  }
  return [
    ...(data.two ? [{ pieces: 2, text: statsLine(data.two), active: pieces >= 2 }] : []),
    { pieces: 4, text: statsLine(data.four), active: pieces >= 4 },
  ];
}

/** A hero's sets, as the heroes page says them: what each gives it, those on (nothing for part of one). */
export function setLines(found: { set: TmSetId; pieces: number } | null, heroClass: RaidClassId, pieces: readonly Pick<GearPiece, 'item'>[] = []): string[] {
  const out: string[] = [];
  const set = found && TM_SETS_BY_ID.get(found.set);
  if (found && set && found.pieces >= TM_SET_PIECES) out.push(`${set.emoji} **${set.name} set**: ${set.effects[heroClass] ?? 'nothing for this class'}`);
  for (const [id, count] of setCounts(pieces, heroClass)) {
    if (KR_TM_SETS.includes(id)) continue;
    for (const bonus of setBonusLines(id, heroClass, count)) if (bonus.active) out.push(`🐉 **${KR_SETS[id]?.name ?? id} set (${bonus.pieces})**: ${bonus.text}`);
  }
  return out;
}

/** The part names, for the pages' lines. */
export const partName = (part: HeroPart): string => HERO_PART_NAME[part];

/**
 * What a hero takes into a TechnoMagic Raid run: its gear's stats, its set (null: none), its own unique weapon's
 * tier (null: none worn), its main treasure when it is one of its own unique treasures (which, 1 to 4, at which tier;
 * null: none), its artifact (which, at which tier; null: none), and the additional skill of each piece of TechnoMagic gear it wears.
 */
export interface RaidGear {
  bonus: HeroBonus;
  set: TmSetId | null;
  uw: number | null;
  ut: { skill: number; tier: number } | null;
  artifact: { id: string; tier: number } | null;
  skills: string[];
  /** The ids of the copies it wears that count (as the raid counts them). */
  copies: string[];
}

/** The additional skills a hero has of the copies it wears: each TechnoMagic piece's (its unique option) that works on its class (as its stats do). */
export const heroSkills = (pieces: readonly { item: ItemDef; skill?: string }[], heroClass: RaidClassId): string[] =>
  pieces.filter(({ item, skill }) => item.kr?.unique && skill && worksOn(item, heroClass)).map(({ skill }) => skill as string);

/** A copy as the raid counts it (what raidGear reads of each). */
export type RaidCopy = Pick<ItemCopyDoc, '_id' | 'itemId' | 'level' | 'tmSkill' | 'tmPotentials'> & Partial<Pick<ItemCopyDoc, 'tmArmorDef' | 'options' | 'runes'>>;

/**
 * What each of the member's heroes' gear gives it in the raid, as the raid counts it (raidValue: points for a
 * chance or share, a share for the rest), the TechnoMagic set whose effect it has, its own unique weapon's
 * tier, its main unique treasure, its artifact, and its TechnoMagic gear's additional skills, by hero id: the gear a raid
 * run is played with. Only copies they still own, in a slot they fit (heroSlotsFor), on that hero, a unique weapon or
 * treasure only on its own hero, each unique treasure once (a second copy of one counts for nothing), and sub treasures
 * only under a main one that is a unique treasure (as the heroes page shows them).
 */
export function raidGear(copies: readonly RaidCopy[], member: Pick<MemberDoc, 'heroes'> | null): Map<string, RaidGear> {
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
    let artifact: RaidGear['artifact'] = null;
    const treasures = new Set<string>();
    for (const slot of HERO_SLOTS) {
      const copy = owned.get(doc.equipment?.[slot] ?? '');
      const item = copy && ITEMS_BY_ID.get(copy.itemId);
      if (!copy || !item || !heroWearable(item) || !wieldedBy(item, hero.id) || !fitsSlot(item, slot) || worn.get(copy._id) !== hero.id) continue;
      // (A sub treasure only under a main one that is a unique treasure: the treasure slot comes first.)
      if (SIDE_SLOTS.includes(slot) && ut === null) continue;
      if (!countsOnce(item, treasures)) continue;
      if (item.uniqueWeapon !== undefined) uw = uniqueTier(copy.level);
      if (item.uniqueTreasure !== undefined && slot === 'treasure') ut = { skill: item.uniqueTreasure.skill, tier: treasureTier(copy.level) };
      if (item.kr?.part === 'artifact') artifact = { id: item.id, tier: refineLevel(copy.level, 0) };
      on.push({
        item,
        level: refineLevel(copy.level, 0),
        ...(item.uniqueTreasure && copy.tmPotentials && { potentials: copy.tmPotentials }),
        ...(copy.options && { options: copy.options }),
        ...(copy.runes && { runes: copy.runes }),
        ...(slot === 'treasure' && { main: true }),
      });
      skilled.push({ item, ...(copy.tmSkill !== undefined && { skill: copy.tmSkill }) });
      counted.push(copy._id);
    }
    const shares = heroBonus(on, hero.class, hero.id);
    out.set(hero.id, {
      bonus: Object.fromEntries(HERO_STAT_IDS.map((stat) => [stat, raidValue(stat, shares[stat])])) as HeroBonus,
      set: activeSet(heroSet(on, hero.class)),
      uw,
      ut,
      artifact,
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
 * Which of the member's King's Raid copies' effects are on, by copy id (a copy not in it has neither on): a copy's
 * additional effect is on while a hero of its class wears it, and its set effect while that hero also has its set's
 * effect (TM_SET_PIECES of a TechnoMagic set, 2 of a dragon set's). As the raid counts them (raidGear).
 */
export function activeTmEffects(copies: readonly RaidCopy[], member: Pick<MemberDoc, 'heroes'> | null): Map<string, TmEffectsOn> {
  const byId = new Map(copies.map((copy) => [copy._id, copy]));
  const out = new Map<string, TmEffectsOn>();
  for (const [heroId, gear] of raidGear(copies, member)) {
    const hero = HEROES.find((one) => one.id === heroId);
    if (!hero) continue;
    const items = gear.copies.flatMap((id) => {
      const item = ITEMS_BY_ID.get(byId.get(id)?.itemId ?? '');
      return item ? [{ item }] : [];
    });
    const counts = setCounts(items, hero.class);
    for (const id of gear.copies) {
      const copy = byId.get(id);
      const item = copy && ITEMS_BY_ID.get(copy.itemId);
      if (!copy || !item?.kr) continue;
      const works = worksOn(item, hero.class);
      const set = item.kr.set;
      const lit = set !== undefined && (KR_TM_SETS.includes(set) ? set === gear.set : (counts.get(set) ?? 0) >= 2);
      out.set(id, { set: works && lit, additional: works && item.kr.unique === true && copy.tmSkill !== undefined, works });
    }
  }
  return out;
}

/** What each of the member's heroes' gear gives it in the raid, by hero id (raidGear's, without the sets). */
export const raidBonuses = (copies: readonly RaidCopy[], member: Pick<MemberDoc, 'heroes'> | null): Map<string, HeroBonus> =>
  new Map([...raidGear(copies, member)].map(([id, { bonus }]) => [id, bonus]));

/** The old TechnoMagic armor's main stat's DEF, for what reads it (data/tm-main.ts). */
export type { TmArmorDef };
