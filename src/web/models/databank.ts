import { bossBrief } from '../../commands/raid.js';
import { CONFIG } from '../../config.js';
import { bossEssences, type EssenceId } from '../../data/transcend.js';
import { raidRewards } from '../../lib/events/raid.js';
import { RAID_BOSS_IDS, RAID_CLASS_IDS, REFINE, TEXT, type RaidBossId, type RaidClassId } from '../../constants/index.js';
import { ITEMS } from '../../data/items.js';
import { describeEffects } from '../../lib/game/items/equipment.js';
import { soldInRaidShop } from '../../lib/game/items/raid-shop.js';
import { classTraits } from '../../lib/game/raid-classes.js';
import { TM_SET_PIECES, TM_SETS_BY_ID, tmSetEffect } from '../../data/tm-sets.js';
import { TM_POTENTIAL_LINES, TM_POTENTIALS } from '../../data/tm-potentials.js';
import { formatPercent } from '../../lib/format.js';
import { HEROES_BY_ID } from '../../data/heroes.js';
import { uniqueTier } from '../../lib/game/heroes.js';
import { uniqueWeaponText } from '../../../vendor/technomagic-sim.mjs';
import type { ItemDef, Slot, Stars } from '../../types.js';
import type { RaidLevel } from '../games/raid/protocol.js';
import { difficultyLevels, picturePath } from '../games/raid/view.js';

/*
 * The site's databank page (GET /api/databank): every item in the catalog and what it does at each
 * refinement level and where it comes from, like the `databank` command; and every raid boss, what it
 * does and what each difficulty level makes of it, like `raid stats`. It's the same for everyone, so it
 * needs no login.
 * Effect lines are the gear card's, as Discord shows them (the page draws the emoji and *italics*); a
 * boss's lines are Discord markdown too.
 */

export interface DatabankItem {
  id: string;
  name: string;
  stars: Stars;
  slot: Slot;
  description: string;
  /** What it does at each refinement level: `effects[0]` is R1, the last is REFINE.maxLevel. */
  effects: string[][];
  /** What it does as a masterwork at REFINE.maxLevel (its bonus on), or null when it has no bonus. */
  masterwork: string[] | null;
  /** Made for certain members: the share of its effects anyone else gets (null when anyone can use it). */
  borrowed: number | null;
  /**
   * Where it first comes from: pulled from the gacha, dropped by raid bosses (ItemDef.raidDrop), pulled from
   * the limited banner only (ItemDef.limited), dropped by the TechnoMagic Raid (ItemDef.tmDrop: only heroes wear
   * it), or pulled from the Hero Item banner (ItemDef.uniqueWeapon: only its own hero wields it).
   */
  source: ItemSource;
  /** Every place it comes from, `source` first: a raid item the raid shop sells (lib/game/items/raid-shop.ts) has that too. */
  sources: ItemSource[];
  /** A class item: the raid class (Databank.classes) its effects only work for. Null for everyone's. */
  class: RaidClassId | null;
  /** A unique weapon: the id of the one hero that wields it. Null otherwise. */
  uniqueWeapon: string | null;
  /**
   * TechnoMagic gear: the set it belongs to (its name, and its effect for each class), which raid's boss drops it,
   * how many pieces on a hero give its effect, and this piece's own (for its class; null for a treasure, apart from
   * the set). Null otherwise.
   */
  set: { name: string; boss: string; effects: Partial<Record<RaidClassId, string>>; pieces: number; effect: string | null } | null;
}

/** Where an item comes from: the gacha, raid bosses (and their shop), the limited banner, the TechnoMagic Raid, or the Hero Item banner (a unique weapon). */
export type ItemSource = 'gacha' | 'raid' | 'raidShop' | 'limited' | 'technomagic' | 'heroBanner';

/** One raid boss: what `raid stats` says of it. */
export interface DatabankBoss {
  id: RaidBossId;
  name: string;
  emoji: string;
  /** Its picture (calm): its path under the bot's /api (GET). */
  picture: string;
  /**
   * Its HP at difficulty 1 (lib/events/raid.ts's bossHpFor): `perRaider` for every raider past the first
   * `overhead`, a party of fewer than `minRaiders` counted as that many. `gear` is what it has on top for
   * every raider (the overhead ones too) at the levels that need gear (RaidLevel.gear), and RaidLevel.wall of it below them.
   */
  hp: { perRaider: number; overhead: number; minRaiders: number; gear: number };
  /** What it does, in Discord markdown: its phases and its moves. */
  phases: string[];
  moves: string[];
  /**
   * What everyone who fought gets for beating it at each of DatabankRaid.levels, in their order: points, komaTokens,
   * komaGems, and so many of each of its three hero essences (data/transcend.ts RAID_BOSS_ESSENCES). The raid items a
   * win can drop besides are DatabankRaid.levels' and the drop chances'.
   */
  rewards: DatabankRewards[];
}

/** What a win at one difficulty level pays each raider. */
export interface DatabankRewards {
  points: number;
  tokens: number;
  gems: number;
  essences: Partial<Record<EssenceId, number>>;
}

/** What goes for every raid boss. */
export interface DatabankRaid {
  /** The rounds a raid lasts at most: the boss gets away (and the raid is lost) if it is still standing after them. */
  maxRounds: number;
  /** Every difficulty level, from 1: what it multiplies the boss's HP and damage by, and what a win at it drops for each raider. */
  levels: RaidLevel[];
}

/** GET /api/databank. */
export interface Databank {
  maxLevel: number;
  /**
   * The chance (0 to 1) a party that beats a raid boss gets raid drops, each of them finding one
   * (raid.dropChance), before what each raider adds to it (raid.dropChancePerRaider). Both 0 when drops are off.
   */
  raidDropChance: number;
  raidDropChancePerRaider: number;
  /** Highest tier first, then in catalog order. */
  items: DatabankItem[];
  /**
   * The raid classes, in their order: what a class item's tag says, what the page's filter offers, and
   * (the page's Classes) what each does in a fight, a line of Discord markdown each (lib/game/raid-classes.ts).
   */
  classes: { id: RaidClassId; name: string; traits: string[] }[];
  /** Every raid boss, in the order the weeks go through them, and what goes for them all. */
  bosses: DatabankBoss[];
  raid: DatabankRaid;
}

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
  item.raidDrop ? 'raid' : item.tmDrop ? 'technomagic' : item.uniqueWeapon !== undefined ? 'heroBanner' : item.limited ? 'limited' : 'gacha';

/** A unique weapon's own effect at a refine level, as the heroes page says it (none for any other item). */
function uniqueLines(item: ItemDef, level: number): string[] {
  const owner = item.uniqueWeapon === undefined ? undefined : HEROES_BY_ID.get(item.uniqueWeapon);
  const text = owner ? uniqueWeaponText(owner.id, uniqueTier(level)) : null;
  return owner && text ? [`${owner.name} only, ★${uniqueTier(level)}: ${text}`] : [];
}

/** TechnoMagic gear's effects, as the databank shows them: how many potentials a copy rolls, then each it can roll with its range (the settings' hero.potentials). */
const potentialPool = (): string[] => [
  `${TM_POTENTIAL_LINES} of these at random as it drops, each a different one:`,
  ...TM_POTENTIALS.map(({ id, name }) => `**${name}**: +${formatPercent(CONFIG.hero.potentials[id].min)} to +${formatPercent(CONFIG.hero.potentials[id].max)}`),
];

/** A TechnoMagic item's set, as the databank shows it (null: it isn't TechnoMagic gear). */
function setOf(item: ItemDef): DatabankItem['set'] {
  const set = item.tmSet && TM_SETS_BY_ID.get(item.tmSet);
  return set ? { name: set.name, boss: set.boss, effects: set.effects, pieces: TM_SET_PIECES, effect: tmSetEffect(item) } : null;
}
export function databankView(items: readonly ItemDef[] = ITEMS): Databank {
  const levels = Array.from({ length: REFINE.maxLevel }, (_, i) => i + 1);
  const list = items.map(
    (item): DatabankItem => ({
      id: item.id,
      name: item.name,
      stars: item.stars,
      slot: item.slot,
      description: item.description,
      // (A unique weapon's own effect in the raid, at each level, after its perks.)
      // (TechnoMagic gear's: the potentials a copy can roll, whatever its level.)
      effects: levels.map((level) => (item.tmDrop ? potentialPool() : [...describeEffects(item, 1, level, false), ...uniqueLines(item, level)])),
      masterwork: item.bonus ? describeEffects(item, 1, REFINE.maxLevel, true) : null,
      borrowed: item.usableBy ? CONFIG.equipment.borrowed.effectiveness : null,
      source: sourceOf(item),
      sources: item.raidDrop ? ['raid', ...(soldInRaidShop(item, CONFIG.raid.shop) ? (['raidShop'] as const) : [])] : [sourceOf(item)],
      class: item.class ?? null,
      uniqueWeapon: item.uniqueWeapon ?? null,
      set: setOf(item),
    }),
  );
  // A stable sort: within a tier, the catalog's own order.
  // Best first: TechnoMagic gear (a tier of its own, above 4 stars), the unique weapons (between it and 4 stars), then by stars.
  const tier = (item: DatabankItem): number => (item.source === 'technomagic' ? 5 : item.source === 'heroBanner' ? 4.5 : item.stars);
  list.sort((a, b) => tier(b) - tier(a));
  return {
    maxLevel: REFINE.maxLevel,
    raidDropChance: CONFIG.raid.dropChance,
    raidDropChancePerRaider: CONFIG.raid.dropChancePerRaider,
    items: list,
    classes: RAID_CLASS_IDS.map((id) => ({ id, name: TEXT.raid.classes[id].name, traits: classTraits(id) })),
    bosses: RAID_BOSS_IDS.map(bossView),
    raid: { maxRounds: CONFIG.raid.maxRounds, levels: difficultyLevels() },
  };
}
