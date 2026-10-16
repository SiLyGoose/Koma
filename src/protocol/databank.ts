import type { EssenceId, HeroSkillView } from './heroes.js';
import type { Slot, Stars } from './items.js';
import type { RaidBossId, RaidClassId, RaidLevel } from './raid.js';

/* The databank page on the site: what the bot's GET /api/databank (the same for everyone) and GET /api/raid/week (a server's) say. */

export interface DatabankItem {
  id: string;
  name: string;
  stars: Stars;
  slot: Slot;
  description: string;
  /** What it does at each refinement level: `effects[0]` is R1, the last is REFINE.maxLevel. */
  effects: string[][];
  /** Made for certain members: the share of its effects anyone else gets (null when anyone can use it). */
  borrowed: number | null;
  /**
   * Where it first comes from: pulled from the gacha, dropped by raid bosses (ItemDef.raidDrop), pulled from
   * the limited banner only (ItemDef.limited), dropped by the TechnoMagic Raid (ItemDef.tmDrop: only heroes wear
   * it), or pulled from the Hero Item banner (ItemDef.uniqueWeapon, ItemDef.uniqueTreasure: only its own hero wears it).
   */
  source: ItemSource;
  /** Every place it comes from, `source` first: a raid item the raid shop sells (lib/game/items/raid-shop.ts) has that too. */
  sources: ItemSource[];
  /** A class item: the raid class (Databank.classes) its effects only work for. Null for everyone's. */
  class: RaidClassId | null;
  /** A unique weapon: the id of the one hero that wields it. Null otherwise. */
  uniqueWeapon: string | null;
  /** A unique treasure: the hero that wears it, and which of its four it is (1 to 4: UT1 to UT4, its skills' then its passive's). Null: not one. */
  uniqueTreasure: { hero: string; skill: number } | null;
  /**
   * TechnoMagic gear: the set it belongs to (its name, and its effect for each class), which raid's boss drops it,
   * how many pieces on a hero give its effect, and this piece's own (for its class; null for a treasure, apart from
   * the set). Null otherwise.
   */
  set: { name: string; boss: string; effects: Partial<Record<RaidClassId, string>>; pieces: number; effect: string | null } | null;
  /**
   * The lines every one of its levels starts with, kept once for every item that has them (Databank.pools): TechnoMagic
   * gear's potentials, a unique treasure's options. `effects` has only what comes after them. Left out: none.
   */
  pool?: DatabankPool;
}

/** Lines many items share (Databank.pools): TechnoMagic gear's potentials ('tm'), a unique treasure's options ('ut'). */
export type DatabankPool = 'tm' | 'ut';

/** Where an item comes from: the gacha, raid bosses (and their shop), the limited banner, the TechnoMagic Raid, or the Hero Item banner (a unique weapon or treasure). */
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
  /** The lines many items' levels start with (DatabankItem.pool), sent once rather than with each of them (over a hundred times). */
  pools: Record<DatabankPool, string[]>;
  /**
   * The raid classes, in their order: what a class item's tag says, what the page's filter offers, and
   * (the page's Classes) what each does in a fight, a line of Discord markdown each (lib/game/raid-classes.ts).
   */
  classes: { id: RaidClassId; name: string; traits: string[] }[];
  /** Every raid boss, in the order the weeks go through them, and what goes for them all. */
  bosses: DatabankBoss[];
  raid: DatabankRaid;
  /** The TechnoMagic Raid's heroes, in the order the shop shows them: each one's three skills, then its passive. */
  heroes: { id: string; abilities: HeroSkillView[] }[];
}

/** GET /api/raid/week: a server's raid, for the databank's boss pages. */
export interface RaidWeekView {
  /** This week's boss there. */
  boss: string;
  /** The hardest difficulty the server can pick (one past the hardest it has beaten). */
  maxDifficulty: number;
  /** When the week's raid resets (ms). */
  resetsAt: number;
}
