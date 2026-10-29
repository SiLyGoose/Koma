import { bossBrief } from '../../commands/raid.js';
import { CONFIG } from '../../config.js';
import { bossEssences } from '../../data/transcend.js';
import { raidRewards } from '../../lib/events/raid.js';
import { RAID_BOSS_IDS, RAID_CLASS_IDS, REFINE, TEXT, type RaidBossId, type RaidClassId } from '../../constants/index.js';
import { heroBannerItem, ITEMS } from '../../data/items.js';
import { ARTIFACT_TEXT, isTmPiece, KR_ITEMS, KR_TM_SETS } from '../../data/kr-gear.js';
import { describeEffects } from '../../lib/game/items/equipment.js';
import { soldInRaidShop } from '../../lib/game/items/raid-shop.js';
import { classTraits } from '../../lib/game/raid-classes.js';
import { tmMainStats } from '../../data/tm-main.js';
import { TM_SET_PIECES, TM_SETS_BY_ID, tmSetEffect } from '../../data/tm-sets.js';
import { TM_POTENTIAL_LINES, TM_POTENTIALS, UT_OPTION_LINES } from '../../data/tm-potentials.js';
import { fmt, formatPercent } from '../../lib/format.js';
import { utHp } from '../../data/ut-hp.js';
import { HEROES, HEROES_BY_ID } from '../../data/heroes.js';
import { partOf, treasureTier, uniqueTier } from '../../lib/game/heroes.js';
import { uniqueTreasureText, uniqueWeaponText } from '../../../vendor/technomagic-sim.mjs';
import type { ItemDef, TmSetId } from '../../types.js';
import { difficultyLevels, picturePath } from '../games/raid/view.js';
import type { Databank, DatabankBoss, DatabankItem, DatabankRaid, DatabankRewards, ItemSource } from '../../protocol/databank.js';

export type { Databank, DatabankBoss, DatabankItem, DatabankRaid, DatabankRewards, ItemSource };

/*
 * The site's databank page (GET /api/databank): every item in the catalog and what it does at each
 * refinement level and where it comes from, like the `databank` command; and every raid boss, what it
 * does and what each difficulty level makes of it, like `raid stats`. It's the same for everyone, so it
 * needs no login.
 * Effect lines are the gear card's, as Discord shows them (the page draws the emoji and *italics*); a
 * boss's lines are Discord markdown too.
 */

function bossView(id: RaidBossId): DatabankBoss {
  const { name, emoji } = TEXT.raid.bosses[id];
  const { hpPerRaider, hpOverhead, minRaiders, gearHp } = CONFIG.raid;
  const { phases, moves } = bossBrief(CONFIG.raid, id);
  const rewards = difficultyLevels().map(({ level }): DatabankRewards => {
    const { points, tokens, gems, essences } = raidRewards(level, CONFIG.raid);
    return { points, tokens, gems, essences: bossEssences(id, essences) };
  });
  return { id, name, emoji, picture: picturePath(id, 'calm'), hp: { perRaider: hpPerRaider[id], overhead: hpOverhead[id], minRaiders, gear: gearHp[id] }, phases, moves, rewards };
}

/** Where an item comes from (a raid drop's shop aside). */
const sourceOf = (item: ItemDef): ItemSource =>
  item.raidDrop ? 'raid' : item.tmDrop ? 'technomagic' : heroBannerItem(item) ? 'heroBanner' : item.limited ? 'limited' : 'gacha';

/** Each potential a copy can roll, with its range (the settings' hero.potentials). */
const potentialRanges = (): string[] => TM_POTENTIALS.map(({ id, name }) => `**${name}**: +${formatPercent(CONFIG.hero.potentials[id].min)} to +${formatPercent(CONFIG.hero.potentials[id].max)}`);

/** The options a unique treasure's copy rolls, as the databank shows them: every unique treasure's the same (Databank.pools.ut). */
const optionPool = (): string[] => [`${UT_OPTION_LINES} of these at random as it is pulled, each a different one:`, ...potentialRanges()];

/** A unique treasure's own effect at a refine level, as its hero's main treasure (after its options: optionPool). */
function treasureLines(item: ItemDef, level: number): string[] {
  const ut = item.uniqueTreasure;
  const owner = ut ? HEROES_BY_ID.get(ut.hero) : undefined;
  const effect = ut && owner ? uniqueTreasureText(owner.id, ut.skill, treasureTier(level)) : null;
  return [`As main treasure: +${fmt(utHp(level))} HP`, ...(owner && effect ? [`${owner.name} only, as main treasure, ★${treasureTier(level)}: ${effect.text}`] : [])];
}

/** A unique weapon's own effect at a refine level, as the heroes page says it (none for any other item). */
function uniqueLines(item: ItemDef, level: number): string[] {
  const owner = item.uniqueWeapon === undefined ? undefined : HEROES_BY_ID.get(item.uniqueWeapon);
  const text = owner ? uniqueWeaponText(owner.id, uniqueTier(level)) : null;
  return owner && text ? [`${owner.name} only, ★${uniqueTier(level)}: ${text}`] : [];
}

/** TechnoMagic gear's effects, as the databank shows them: how many potentials a copy rolls, then each it can roll with its range (Databank.pools.tm). */
const potentialPool = (): string[] => [`${TM_POTENTIAL_LINES} of these at random as it drops, each a different one:`, ...potentialRanges()];

/** A TechnoMagic item's set, as the databank shows it (null: it isn't TechnoMagic gear). */
function setOf(item: ItemDef): DatabankItem['set'] {
  const set = item.tmSet && TM_SETS_BY_ID.get(item.tmSet);
  return set ? { name: set.name, boss: set.boss, effects: set.effects, pieces: TM_SET_PIECES, effect: tmSetEffect(item) } : null;
}
/**
 * King's Raid's artifacts (T10), as the databank shows them: what each does at each of its stars (King's Raid's words, as a
 * hero's piece says them), from a TechnoMagic Raid win now and then or the Hero Item banner's top tier.
 */
function artifactView(item: ItemDef, levels: readonly number[]): DatabankItem {
  const text = ARTIFACT_TEXT.get(item.id);
  return {
    id: item.id,
    name: item.name,
    stars: item.stars,
    slot: item.slot,
    part: 'artifact',
    description: item.description,
    effects: levels.map((level) => {
      const line = text?.[treasureTier(level)];
      return line ? [line] : [];
    }),
    borrowed: null,
    source: 'technomagic',
    sources: ['technomagic', 'heroBanner'],
    class: null,
    uniqueWeapon: null,
    uniqueTreasure: null,
    set: null,
    ...(item.kr?.icon && { icon: item.kr.icon }),
  };
}

/**
 * King's Raid's TechnoMagic sets' pieces (each class's Armor, Mantle, Accessories and Orb), as the databank shows them: its
 * set (whose boss drops it, and its 4-piece skill for the piece's class), its icon and its class. What a copy has (its main
 * stat by its stars, the options and unique option it rolls, its rune sockets) the site says from King's Raid's data.
 */
function tmPieceView(item: ItemDef, levels: readonly number[]): DatabankItem {
  const kr = item.kr;
  const set = kr?.set ? TM_SETS_BY_ID.get(kr.set as TmSetId) : undefined;
  const cls = kr?.classes[0] ?? null;
  return {
    id: item.id,
    name: item.name,
    stars: item.stars,
    slot: item.slot,
    part: kr?.part ?? null,
    description: item.description,
    effects: levels.map(() => []),
    borrowed: null,
    source: 'technomagic',
    sources: ['technomagic'],
    class: cls,
    uniqueWeapon: null,
    uniqueTreasure: null,
    set: set ? { name: set.name, boss: set.boss, effects: set.effects, pieces: TM_SET_PIECES, effect: (cls && set.effects[cls]) ?? 'nothing for its class' } : null,
    ...(kr?.icon && { icon: kr.icon }),
  };
}

/** TechnoMagic pieces in the databank's order: by set (KR_TM_SETS's), then class (the raid's), then part, Armor to Orb. */
const PART_ORDER: readonly string[] = ['armor', 'secondary', 'accessory', 'orb'];
const byPiece = (a: ItemDef, b: ItemDef): number => {
  const rank = (item: ItemDef): number[] => [KR_TM_SETS.indexOf(item.kr?.set ?? ''), RAID_CLASS_IDS.indexOf(item.kr?.classes[0] as RaidClassId), PART_ORDER.indexOf(item.kr?.part ?? '')];
  const [x, y] = [rank(a), rank(b)];
  return x.map((one, i) => one - (y[i] ?? 0)).find((diff) => diff !== 0) ?? 0;
};

export function databankView(items: readonly ItemDef[] = ITEMS): Databank {
  const levels = Array.from({ length: REFINE.maxLevel }, (_, i) => i + 1);
  const list = items.map(
    (item): DatabankItem => ({
      id: item.id,
      name: item.name,
      stars: item.stars,
      slot: item.slot,
      part: partOf(item),
      description: item.description,
      // (A unique weapon's own effect in the raid, at each level, after its perks.)
      // (TechnoMagic gear's: the potentials a copy can roll, whatever its level: its pool, and nothing after it.)
      // (A unique treasure's: the options a copy can roll (its pool), then its own effect at each level.)
      effects: levels.map((level) => (item.tmDrop ? [] : item.uniqueTreasure ? treasureLines(item, level) : [...describeEffects(item, 1, level), ...uniqueLines(item, level)])),
      ...(item.tmDrop ? { pool: 'tm' as const } : item.uniqueTreasure ? { pool: 'ut' as const } : {}),
      borrowed: item.usableBy ? CONFIG.equipment.borrowed.effectiveness : null,
      source: sourceOf(item),
      sources: item.raidDrop ? ['raid', 'dragon', ...(soldInRaidShop(item, CONFIG.raid.shop) ? (['raidShop'] as const) : [])] : [sourceOf(item)],
      class: item.class ?? null,
      uniqueWeapon: item.uniqueWeapon ?? null,
      uniqueTreasure: item.uniqueTreasure ? { hero: item.uniqueTreasure.hero, skill: item.uniqueTreasure.skill } : null,
      set: setOf(item),
      // (TechnoMagic gear's main stat: a weapon's HP, an armor's P.DEF or M.DEF, whichever its copy rolls.)
      ...(item.tmDrop && tmMainStats(item).length > 0 && { mainStats: tmMainStats(item).map(({ name, value }) => ({ name, value })) }),
    }),
  );
  // A stable sort: within a tier, the catalog's own order.
  // Best first: TechnoMagic gear (a tier of its own, above 4 stars), the unique weapons (between it and 4 stars), then by stars.
  const tier = (item: DatabankItem): number => (item.source === 'technomagic' ? 5 : item.uniqueTreasure !== null ? 4.4 : item.source === 'heroBanner' ? 4.5 : item.stars);
  list.sort((a, b) => tier(b) - tier(a));
  // (King's Raid's TechnoMagic pieces, by set, class and part, then its artifacts, A to Z: lists of their own on the site.)
  list.push(...[...KR_ITEMS.filter(isTmPiece)].sort(byPiece).map((item) => tmPieceView(item, levels)));
  const artifacts = KR_ITEMS.filter((item) => item.kr?.part === 'artifact').map((item) => artifactView(item, levels));
  list.push(...artifacts.sort((a, b) => a.name.localeCompare(b.name)));
  return {
    maxLevel: REFINE.maxLevel,
    raidDropChance: CONFIG.raid.dropChance,
    raidDropChancePerRaider: CONFIG.raid.dropChancePerRaider,
    items: list,
    pools: { tm: potentialPool(), ut: optionPool() },
    classes: RAID_CLASS_IDS.map((id) => ({ id, name: TEXT.raid.classes[id].name, traits: classTraits(id) })),
    heroes: HEROES.map(({ id, abilities }) => ({ id, abilities: [...abilities] })),
    bosses: RAID_BOSS_IDS.map(bossView),
    raid: { maxRounds: CONFIG.raid.maxRounds, levels: difficultyLevels() },
  };
}
