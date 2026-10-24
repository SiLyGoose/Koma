import { randomInt } from 'node:crypto';
import type { RaidClassId } from '../constants/raid.js';
import { TM_RECLAIMED } from '../constants/technomagic.js';
import type { HeroPart } from '../protocol/heroes.js';
import type { ItemDef, KrItem, KrMainStat, KrOption, Slot } from '../types.js';
import { KR_PIECES, KR_POOLS, KR_REFINE, KR_RUNES, KR_SETS, TM_ARTIFACTS, type KrOptionData, type KrRuneData } from '../../vendor/technomagic-sim.mjs';

/*
 * King's Raid's hero gear, as the TechnoMagic Raid has it: Koma-UI's src/technomagic/sim/gear/kr-data.ts (from the CBT2
 * playtest's tables), here from vendor/technomagic-sim.mjs. Every piece is an item (KR_ITEMS: ItemDef.kr), never pulled:
 *
 *   - the TechnoMagic sets' pieces (Perseverance, Galgoria's; Hope, Siegfried's; Authority, Ascalon's): each class's Armor,
 *     Mantle, four Accessories (Earrings, Ring, Bracelet, Necklace) and Orb, each with 2 options and a unique option
 *     (its additional skill: ItemCopyDoc.tmSkill), dropped by its raid;
 *   - the dragon sets (Opportune Fire, Gritty Frost, Unrelenting Poison, Swift Darkness) at tiers 6 to 8: every part, each
 *     class's weapon, with 4 options, dropped by the Dragon Raid (the higher its stage, the higher the tier);
 *   - the artifacts the fight has a use for (vendor's TM_ARTIFACTS), in a hero's artifact slot.
 *
 * Every copy is at its max level (King's Raid's +30): only its refinement (King's Raid's stars, 0★ to 5★: a duplicate used up
 * each, as any gear's; a TechnoMagic piece's, its class's Upgrade Stones: constants/technomagic.ts TM_STONES) raises its main
 * stat (KR_REFINE), and a Reclaimed TechnoMagic copy's is higher (TM_RECLAIMED). Its options (ItemCopyDoc.options) are rolled as it drops, each any
 * stat of its pool's (two may be the same, as King's Raid's), by its pool's weights, at a step at random; a reroll rolls one again, an enhance rolls one's
 * step again (its stat kept). Its runes (KR_RUNES: King's Raid's 224) go in its sockets, as many as its part has (and a unique weapon's three).
 */

export { KR_POOLS, KR_RUNES, KR_SETS };

/** The member slot kind each part counts as, for the pages' filters (a hero's own slot is its part's). */
const SLOT_OF: Readonly<Record<HeroPart, Slot>> = { weapon: 'weapon', armor: 'armor', secondary: 'armor', accessory: 'treasure', orb: 'treasure', treasure: 'treasure', artifact: 'treasure' };

/** The TechnoMagic sets (each one raid's), apart from the dragon sets. */
export const KR_TM_SETS: readonly string[] = ['perseverance', 'hope', 'authority'];

/** Whether `item` is a TechnoMagic set's piece: awakened with its class's Upgrade Stones, and maybe Reclaimed. */
export const isTmPiece = (item: Pick<ItemDef, 'kr'>): boolean => KR_TM_SETS.includes(item.kr?.set ?? '');

/** The class whose Upgrade Stones awaken `item` (each TechnoMagic piece is one class's); null: not a TechnoMagic piece. */
export const tmStoneClass = (item: Pick<ItemDef, 'kr'>): RaidClassId | null => (isTmPiece(item) ? (item.kr?.classes[0] ?? null) : null);

/** The dragon sets, and their tiers, lowest first. */
export const KR_DRAGON_SETS: readonly string[] = ['opportune-fire', 'gritty-frost', 'unrelenting-poison', 'swift-darkness'];
export const KR_DRAGON_TIERS: readonly number[] = [6, 7, 8];

/** A unique weapon's rune sockets (King's Raid's: three). */
export const UW_RUNES = 3;

const CLASS_NAME: Readonly<Record<string, string>> = { knight: 'knights', warrior: 'warriors', assassin: 'assassins', archer: 'archers', mechanic: 'mechanics', wizard: 'wizards', priest: 'priests' };
const PART_NAME: Readonly<Record<HeroPart, string>> = { weapon: 'Weapon', armor: 'Armor', secondary: 'Mantle', accessory: 'Accessory', orb: 'Orb', treasure: 'Treasure', artifact: 'Artifact' };

/** What a piece is, said under its name: its set, its part, and who wears it. */
function describe(piece: (typeof KR_PIECES)[number]): string {
  const set = KR_SETS[piece.set]?.name ?? piece.set;
  const who = piece.classes.length >= 7 ? 'any hero' : piece.classes.map((one) => CLASS_NAME[one] ?? one).join(', ');
  const from = KR_TM_SETS.includes(piece.set) ? `TechnoMagic gear of the ${set} set` : `The ${set} set, tier ${piece.tier}`;
  return `${from}: ${PART_NAME[piece.part as HeroPart]} for ${who}.`;
}

/**
 * Every piece and artifact, as items. A dragon set's piece is named alike at every tier (its tier is its kr.tier, which the site's card
 * says on its tab): tieredName says it with its tier, where a name alone has to tell them apart.
 */
export const KR_ITEMS: readonly ItemDef[] = [
  ...KR_PIECES.map(
    (piece): ItemDef => ({
      id: piece.id,
      name: piece.name,
      stars: 4,
      slot: SLOT_OF[piece.part as HeroPart],
      description: describe(piece),
      effects: [],
      kr: {
        part: piece.part as HeroPart,
        ...(piece.kind && { kind: piece.kind }),
        set: piece.set,
        tier: piece.tier,
        classes: piece.classes as readonly RaidClassId[],
        main: piece.main as readonly [KrMainStat, number],
        pool: piece.pool,
        options: piece.options,
        ...(piece.unique && { unique: true }),
        runes: piece.runes,
        icon: piece.icon,
      },
    }),
  ),
  ...TM_ARTIFACTS.map(
    (artifact): ItemDef => ({
      id: artifact.id,
      name: artifact.name,
      stars: 4,
      slot: 'treasure',
      description: 'An artifact: what it does by its stars, raised by awakening it with a duplicate (King’s Raid’s).',
      effects: [],
      kr: { part: 'artifact', tier: 10, classes: [], options: 0, runes: 0, icon: artifact.icon },
    }),
  ),
];

export const KR_ITEMS_BY_ID: ReadonlyMap<string, ItemDef> = new Map(KR_ITEMS.map((item) => [item.id, item]));

/** A pool's option of a stat (none: not in it). */
export const poolOption = (pool: string | undefined, stat: string): KrOptionData | undefined => (pool ? KR_POOLS[pool]?.find((option) => option.stat === stat) : undefined);

/** An option's value (a share) at its step: so far between its least and most, in King's Raid's whole thousandths. */
export function optionValue(option: Pick<KrOptionData, 'min' | 'max' | 'steps'>, step: number): number {
  const min = Math.round(option.min * 1000);
  const max = Math.round(option.max * 1000);
  const at = Math.min(option.steps, Math.max(0, Math.floor(step)));
  return option.steps > 0 ? (min + Math.floor(((max - min) * at) / option.steps)) / 1000 : min / 1000;
}

/** A copy's option's value (0: its pool has no such stat any more). */
export const krOptionValue = (kr: KrItem, option: KrOption): number => {
  const data = poolOption(kr.pool, option.stat);
  return data ? optionValue(data, option.step) : 0;
};

/** The random numbers a roll uses; only tests replace them. */
export interface KrRng {
  index: (max: number) => number;
}

const defaultRng: KrRng = { index: (max) => randomInt(0, max) };

/**
 * The Hero Item banner's rewards that are no copies (ItemDef.grant): King's Raid's Unique Weapon and Unique Treasure Tickets (a
 * selector, sent to the mailbox, its hero picked there), and its Mysterious Runes (a rune of a grade, rolled as it is given).
 */
export const KR_GRANTS: readonly ItemDef[] = [
  { id: 'uw-selector', name: 'Unique Weapon Ticket', stars: 3, slot: 'weapon', description: 'A unique weapon of any hero’s: picked in the mailbox.', effects: [], grant: { selector: 'uw', icon: 'WEAPON_UNIQUE_SELECT_ITEM' } },
  { id: 'ut-selector', name: 'Unique Treasure Ticket', stars: 3, slot: 'treasure', description: 'A unique treasure of any hero’s: picked in the mailbox.', effects: [], grant: { selector: 'ut', icon: 'TREASURE_UNIQUE_SELECT_ITEM' } },
  { id: 'rune-box-rare', name: 'Mysterious Rune: Rare', stars: 1, slot: 'treasure', description: 'A Rare rune, any as likely.', effects: [], grant: { runeGrade: 3, icon: 'PACKAGE_RUNE_3' } },
  { id: 'rune-box-heroic', name: 'Mysterious Rune: Heroic', stars: 1, slot: 'treasure', description: 'A Heroic rune, any as likely.', effects: [], grant: { runeGrade: 4, icon: 'PACKAGE_RUNE_4' } },
  { id: 'rune-box-legendary', name: 'Mysterious Rune: Legendary', stars: 1, slot: 'treasure', description: 'A Legendary rune, any as likely.', effects: [], grant: { runeGrade: 6, icon: 'PACKAGE_RUNE_5' } },
];

/** A rune of a grade, any as likely (null: none of it). */
export function rollRuneOfGrade(grade: number, rng: KrRng = defaultRng): string | null {
  const pool = KR_RUNES.filter((rune) => rune.grade === grade && rune.ancient !== true);
  return pool.length > 0 ? (pool[rng.index(pool.length)] as KrRuneData).id : null;
}

/** What an artifact does at each refinement (R1 to R5), in King's Raid's words: by its id. */
export const ARTIFACT_TEXT: ReadonlyMap<string, readonly string[]> = new Map(TM_ARTIFACTS.map((artifact) => [artifact.id, artifact.text]));

/** The pieces of King's Raid's hero gear of one set (its raid's drops), and of one dragon set's tier. */
export const krPiecesOf = (set: string, tier?: number): ItemDef[] => KR_ITEMS.filter((item) => item.kr?.set === set && (tier === undefined || item.kr.tier === tier));

/** Whether a piece works on a hero of `heroClass`: one its classes include (an artifact, anyone). */
export const krWornBy = (kr: KrItem, heroClass: RaidClassId): boolean => kr.classes.length === 0 || kr.classes.includes(heroClass);

/**
 * A piece's main stat at refinement `level` (0★ to 5★): its base times King's Raid's factor at max level, as King's Raid works it
 * out (`reclaimed`: a Reclaimed TechnoMagic copy's, TM_RECLAIMED.main times as much).
 */
export function krMainValue(kr: KrItem, level: number, reclaimed = false): number {
  if (!kr.main) return 0;
  const [stat, base] = kr.main;
  const factors = stat === 'atk' ? KR_REFINE.atk : stat === 'hp' ? KR_REFINE.hp : KR_REFINE.def;
  // (Its stars are the index: 0★ to 5★.)
  const factor = factors[Math.min(factors.length - 1, Math.max(0, Math.floor(level)))] as number;
  return Math.floor(((base * factor) / 1000) * (reclaimed ? TM_RECLAIMED.main : 1));
}

/** A main stat's name, as King's Raid's. */
export const KR_MAIN_NAME: Readonly<Record<KrMainStat, string>> = { atk: 'ATK', hp: 'HP', defPhysical: 'P. DEF', defMagical: 'M. DEF' };


/** One of a pool's options, by their weights, but those of the stats in `taken` (none left: null). */
function pickOption(pool: readonly KrOptionData[], taken: ReadonlySet<string>, rng: KrRng): KrOptionData | null {
  const open = pool.filter((option) => !taken.has(option.stat));
  const total = open.reduce((sum, option) => sum + Math.max(1, option.weight), 0);
  if (open.length === 0 || total <= 0) return null;
  let at = rng.index(total);
  for (const option of open) {
    at -= Math.max(1, option.weight);
    if (at < 0) return option;
  }
  return open[open.length - 1] ?? null;
}

/** A step at random, any as likely (0 to the option's steps). */
const stepOf = (option: KrOptionData, rng: KrRng): number => rng.index(option.steps + 1);

/**
 * The options a piece drops with: its pool's, as many as it has, by their weights, each at a step at random. Any of them
 * may be the same stat as another, as King's Raid's may (four ATK lines and all).
 */
export function rollKrOptions(kr: KrItem, rng: KrRng = defaultRng): KrOption[] {
  const pool = kr.pool ? (KR_POOLS[kr.pool] ?? []) : [];
  const out: KrOption[] = [];
  while (out.length < kr.options) {
    const option = pickOption(pool, new Set(), rng);
    if (!option) break;
    out.push({ stat: option.stat, step: stepOf(option, rng) });
  }
  return out;
}

/**
 * A copy's options with its `index`th rolled again: any of its pool's stats, the copy's other options' too, but the one it
 * was (King's Raid's TechnoMagic gear may roll that again as well: EnableRenewSameOption), at a step at random; its rerolls
 * counted. Null: no such option.
 */
export function rerollKrOption(kr: KrItem, options: readonly KrOption[], index: number, rng: KrRng = defaultRng): KrOption[] | null {
  const old = options[index];
  if (!old) return null;
  const pool = kr.pool ? (KR_POOLS[kr.pool] ?? []) : [];
  const same = KR_TM_SETS.includes(kr.set ?? '');
  const option = pickOption(pool, new Set(same ? [] : [old.stat]), rng);
  if (!option) return null;
  return options.map((one, i) => (i === index ? { stat: option.stat, step: stepOf(option, rng), rerolls: (old.rerolls ?? 0) + 1 } : one));
}

/**
 * A copy's options with its `index`th's amount rolled again: the same stat, at a step at random (any as likely: it may go
 * down, or land where it was, never a straight climb to the top). Null: no such option.
 */
export function upgradeKrOption(kr: KrItem, options: readonly KrOption[], index: number, rng: KrRng = defaultRng): KrOption[] | null {
  const old = options[index];
  const option = old ? poolOption(kr.pool, old.stat) : undefined;
  if (!old || !option) return null;
  return options.map((one, i) => (i === index ? { ...one, step: stepOf(option, rng) } : one));
}

/** Whether a copy's options can be upgraded at all (King's Raid's TechnoMagic gear's can't: only rerolled). */
export const upgradable = (kr: KrItem): boolean => kr.options > 0;

/**
 * What rerolling an option costs (points): King's Raid's gem prices for it, five points a gem, climbing with how many times it
 * was rerolled (the last price on and on). Its unique option: as its first reroll's, climbing the same.
 */
export const REROLL_PRICES: readonly number[] = [500, 1_000, 2_000, 4_000, 6_000, 8_000];
export const rerollPrice = (rerolls: number): number => REROLL_PRICES[Math.min(REROLL_PRICES.length - 1, Math.max(0, Math.floor(rerolls)))] as number;

/**
 * What enhancing an option (rolling its amount again) costs (points): a dragon set's piece by its tier, King's Raid's materials for it
 * (EquipOptionUpgradeTable's Legendary); a TechnoMagic piece's, TM_UPGRADE_PRICE (the user's).
 */
export const UPGRADE_PRICES: Readonly<Record<number, number>> = { 6: 512, 7: 768, 8: 1_152 };
export const TM_UPGRADE_PRICE = 1_000;
export const upgradePrice = (kr: KrItem): number => (KR_TM_SETS.includes(kr.set ?? '') ? TM_UPGRADE_PRICE : (UPGRADE_PRICES[kr.tier] ?? UPGRADE_PRICES[8] ?? 0));

/** What rerolling a TechnoMagic piece's unique option (its additional effect) costs, in komaGems: the same every time (the user's). */
export const UNIQUE_REROLL_GEMS = 1;

export const KR_RUNES_BY_ID: ReadonlyMap<string, KrRuneData> = new Map(KR_RUNES.map((rune) => [rune.id, rune]));

/** Whether an item is a dragon set's piece: named alike at every tier of its set. */
export const isDragonPiece = (item: ItemDef): boolean => !!item.kr?.set && KR_DRAGON_SETS.includes(item.kr.set);

/** An item's name with a dragon set's piece's tier after it ("Opportune Fire Sword T8"), where its name alone could be another tier's. */
export const tieredName = (item: ItemDef): string => (isDragonPiece(item) ? `${item.name} T${item.kr?.tier}` : item.name);

/** Whether a rune goes in a piece of `part` (a unique weapon's sockets: a weapon's). */
export const runeFits = (rune: KrRuneData, part: HeroPart): boolean => (rune.parts as readonly string[]).includes(part);

/** A rune's grades' names (ItemTable's: 1 Common to 6 Legendary; an Ancient one and a Velkazar one are 5). */
export const RUNE_GRADE: Readonly<Record<number, string>> = { 1: 'Common', 2: 'Uncommon', 3: 'Rare', 4: 'Heroic', 5: 'Ancient', 6: 'Legendary' };
