import { bossBrief } from '../../commands/raid.js';
import { CONFIG } from '../../config.js';
import { bossEssences } from '../../data/transcend.js';
import { raidRewards } from '../../lib/events/raid.js';
import { RAID_BOSS_IDS, RAID_CLASS_IDS, REFINE, TEXT, type RaidBossId } from '../../constants/index.js';
import { heroBannerItem, ITEMS } from '../../data/items.js';
import { describeEffects } from '../../lib/game/items/equipment.js';
import { soldInRaidShop } from '../../lib/game/items/raid-shop.js';
import { classTraits } from '../../lib/game/raid-classes.js';
import { TM_SET_PIECES, TM_SETS_BY_ID, tmSetEffect } from '../../data/tm-sets.js';
import { TM_POTENTIAL_LINES, TM_POTENTIALS, UT_OPTION_LINES } from '../../data/tm-potentials.js';
import { fmt, formatPercent } from '../../lib/format.js';
import { utHp } from '../../data/ut-hp.js';
import { HEROES, HEROES_BY_ID } from '../../data/heroes.js';
import { treasureTier, uniqueTier } from '../../lib/game/heroes.js';
import { uniqueTreasureText, uniqueWeaponText } from '../../../vendor/technomagic-sim.mjs';
import type { ItemDef } from '../../types.js';
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

/** A unique treasure's effects, as the databank shows them: the options a copy rolls, then its own effect at a refine level (as its hero's main treasure). */
function treasureLines(item: ItemDef, level: number): string[] {
  const ut = item.uniqueTreasure;
  const owner = ut ? HEROES_BY_ID.get(ut.hero) : undefined;
  const effect = ut && owner ? uniqueTreasureText(owner.id, ut.skill, treasureTier(level)) : null;
  return [
    `${UT_OPTION_LINES} of these at random as it is pulled, each a different one:`,
    ...TM_POTENTIALS.map(({ id, name }) => `**${name}**: +${formatPercent(CONFIG.hero.potentials[id].min)} to +${formatPercent(CONFIG.hero.potentials[id].max)}`),
    `As main treasure: +${fmt(utHp(level))} HP`,
    ...(owner && effect ? [`${owner.name} only, as main treasure, ★${treasureTier(level)}: ${effect.text}`] : []),
  ];
}

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
      // (A unique treasure's: the options a copy can roll, and its own effect at each level.)
      effects: levels.map((level) => (item.tmDrop ? potentialPool() : item.uniqueTreasure ? treasureLines(item, level) : [...describeEffects(item, 1, level), ...uniqueLines(item, level)])),
      borrowed: item.usableBy ? CONFIG.equipment.borrowed.effectiveness : null,
      source: sourceOf(item),
      sources: item.raidDrop ? ['raid', ...(soldInRaidShop(item, CONFIG.raid.shop) ? (['raidShop'] as const) : [])] : [sourceOf(item)],
      class: item.class ?? null,
      uniqueWeapon: item.uniqueWeapon ?? null,
      uniqueTreasure: item.uniqueTreasure ? { hero: item.uniqueTreasure.hero, skill: item.uniqueTreasure.skill } : null,
      set: setOf(item),
    }),
  );
  // A stable sort: within a tier, the catalog's own order.
  // Best first: TechnoMagic gear (a tier of its own, above 4 stars), the unique weapons (between it and 4 stars), then by stars.
  const tier = (item: DatabankItem): number => (item.source === 'technomagic' ? 5 : item.uniqueTreasure !== null ? 4.4 : item.source === 'heroBanner' ? 4.5 : item.stars);
  list.sort((a, b) => tier(b) - tier(a));
  return {
    maxLevel: REFINE.maxLevel,
    raidDropChance: CONFIG.raid.dropChance,
    raidDropChancePerRaider: CONFIG.raid.dropChancePerRaider,
    items: list,
    classes: RAID_CLASS_IDS.map((id) => ({ id, name: TEXT.raid.classes[id].name, traits: classTraits(id) })),
    heroes: HEROES.map(({ id, abilities }) => ({ id, abilities: [...abilities] })),
    bosses: RAID_BOSS_IDS.map(bossView),
    raid: { maxRounds: CONFIG.raid.maxRounds, levels: difficultyLevels() },
  };
}
