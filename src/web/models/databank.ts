import { bossBrief } from '../../commands/raid.js';
import { CONFIG } from '../../config.js';
import { RAID_BOSS_IDS, REFINE, TEXT, type RaidBossId } from '../../constants/index.js';
import { ITEMS } from '../../data/items.js';
import { fmt } from '../../lib/format.js';
import { describeEffects } from '../../lib/game/items/equipment.js';
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
  /** Where it comes from: pulled from the gacha, or only dropped by raid bosses (ItemDef.raidDrop). */
  source: ItemSource;
}

export type ItemSource = 'gacha' | 'raid';

/** One raid boss: what `raid stats` says of it. */
export interface DatabankBoss {
  id: RaidBossId;
  name: string;
  emoji: string;
  /** Its picture (calm): its path under the bot's /api (GET). */
  picture: string;
  /**
   * Its HP at difficulty 1 (lib/events/raid.ts's bossHpFor): `perRaider` for every raider past the first
   * `overhead`, a party of fewer than `minRaiders` counted as that many.
   */
  hp: { perRaider: number; overhead: number; minRaiders: number };
  /**
   * What it does, in Discord markdown: its phases, its moves, and what everyone who fought gets for beating
   * it (whatever the difficulty; the raid items a win can drop besides are DatabankRaid.levels' and the drop chances').
   */
  phases: string[];
  moves: string[];
  rewards: string;
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
  /** Every raid boss, in the order the weeks go through them, and what goes for them all. */
  bosses: DatabankBoss[];
  raid: DatabankRaid;
}

function bossView(id: RaidBossId): DatabankBoss {
  const { name, emoji } = TEXT.raid.bosses[id];
  const { hpPerRaider, hpOverhead, minRaiders, reward, tokenReward, gemReward } = CONFIG.raid;
  const { phases, moves } = bossBrief(CONFIG.raid, id);
  const rewards = TEXT.raid.bossRewards(fmt(reward), tokenReward, gemReward);
  return { id, name, emoji, picture: picturePath(id, 'calm'), hp: { perRaider: hpPerRaider[id], overhead: hpOverhead[id], minRaiders }, phases, moves, rewards };
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
      effects: levels.map((level) => describeEffects(item, 1, level, false)),
      masterwork: item.bonus ? describeEffects(item, 1, REFINE.maxLevel, true) : null,
      borrowed: item.usableBy ? CONFIG.equipment.borrowed.effectiveness : null,
      source: item.raidDrop ? 'raid' : 'gacha',
    }),
  );
  // A stable sort: within a tier, the catalog's own order.
  list.sort((a, b) => b.stars - a.stars);
  return {
    maxLevel: REFINE.maxLevel,
    raidDropChance: CONFIG.raid.dropChance,
    raidDropChancePerRaider: CONFIG.raid.dropChancePerRaider,
    items: list,
    bosses: RAID_BOSS_IDS.map(bossView),
    raid: { maxRounds: CONFIG.raid.maxRounds, levels: difficultyLevels() },
  };
}
