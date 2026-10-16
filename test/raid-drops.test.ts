import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bossInfoEmbed, lootKindsText, myLootEmbed, resultEmbed } from '../src/commands/raid.js';
import { DEFAULTS, STARS } from '../src/config.js';
import { RAID_BOSS_IDS, RAID_DIFFICULTY, TEXT } from '../src/constants/index.js';
import { ITEMS, ITEMS_BY_ID, RAID_DROPS, TM_DROPS, UNIQUE_WEAPONS, gachaItems, itemsByStars } from '../src/data/items.js';
import { bossHpFor, bossMultiplier, clampDifficulty, createRaid, difficultyOf, gearWallShare, needsGear, type RaidRng } from '../src/lib/events/raid.js';
import { itemBlock, itemDetail } from '../src/lib/game/items/databank.js';
import { ownTreasures } from '../src/lib/game/items/gacha.js';
import { raidDropChance, raidDropCounts, raidDropsOn, rollRaidDrops, type DropRng } from '../src/lib/game/items/raid-drops.js';
import { findSpec } from '../src/lib/settings-spec.js';
import { EFFECTS } from '../src/perks/index.js';
import { RETIRED_ITEMS } from '../src/services/migrate.js';
import type { ItemDef } from '../src/types.js';

/*
 * Raid drops: the raid gear can't be pulled from the gacha, only found by beating a raid boss. How
 * many a win drops goes by the raid's difficulty.
 */

/** The 3-star raid gear that mirrors a 4-star one (all but the class items, which are 4-star only). */
const MIRRORED_GEAR_3 = ['giants-hauberk', 'quarrybreaker-hammer', 'starfinder-longbow', 'wyvern-tooth', 'cherubs-sash', 'stalwart-pavise', 'whalers-lance', 'consecrated-sickle', 'apothecarys-rod'];

/** The 3-star raid gear the harder difficulties drop: the mirrored ones, and the heal-splash and rally ones, which are 3-star only. */
const RAID_GEAR_3 = [...MIRRORED_GEAR_3, 'dragonbone-staff', 'war-banner'];

/** The class items: 4-star raid items that only work for one class each. */
const CLASS_GEAR = ['oathkeepers-aegis', 'warlords-greataxe', 'dawnsong-censer', 'choirmasters-vestments', 'stormcoil-spanner', 'hexweavers-staff', 'nightfall-shroud', 'windrunners-mantle'];

const RAID_GEAR = ['colossus-plate', 'worldbreaker-maul', 'moonpiercer-bow', 'godslayer-fang', 'seraphs-raiment', 'unbroken-bulwark', ...CLASS_GEAR, 'leviathan-harpoon', 'hallowed-scythe', 'plague-doctors-cane'];

test('raid drops: the raid gear is raid-only, and the gacha leaves it out of every tier', () => {
  assert.deepEqual(RAID_DROPS.map((item) => item.id).sort(), [...RAID_GEAR, ...RAID_GEAR_3].sort());
  for (const id of RAID_GEAR) assert.equal(ITEMS_BY_ID.get(id)?.stars, 4, id);
  for (const id of RAID_GEAR_3) assert.equal(ITEMS_BY_ID.get(id)?.stars, 3, id);
  // Each mirrored 3-star one has the same perks as one of the 4-star ones (the class items have no 3-star one).
  const perks = (ids: string[]): string[] => ids.map((id) => [...(ITEMS_BY_ID.get(id)?.effects ?? [])].sort().join('+')).sort();
  assert.deepEqual(perks(MIRRORED_GEAR_3), perks(RAID_GEAR.filter((id) => !CLASS_GEAR.includes(id))));
  for (const stars of STARS) {
    assert.ok(gachaItems(stars).length > 0, `${stars}-star tier can still be pulled`);
    assert.ok(gachaItems(stars).every((item) => !item.raidDrop && !item.tmDrop));
    const limited = itemsByStars(stars).filter((item) => item.limited).length;
    const technomagic = TM_DROPS.filter((item) => item.stars === stars).length;
    const unique = UNIQUE_WEAPONS.filter((item) => item.stars === stars).length;
    assert.equal(gachaItems(stars).length + RAID_DROPS.filter((item) => item.stars === stars).length + limited + technomagic + unique, itemsByStars(stars).length);
  }
  // Every other item is still pulled as before (the limited ones from their own banner; the TechnoMagic gear drops from its raid).
  assert.equal(ITEMS.filter((item) => !item.raidDrop).length, ITEMS.length - RAID_GEAR.length - RAID_GEAR_3.length);
  assert.ok(TM_DROPS.every((item) => !item.raidDrop && !RAID_DROPS.includes(item)));
  assert.ok(ownTreasures('anyone').every((item) => !item.raidDrop));
});

test('raid drops: every item with a raid perk is a raid drop, and no two items of a tier do the same thing', () => {
  const raidPerk = (effect: string): boolean => /^Raid/.test(EFFECTS[effect as keyof typeof EFFECTS].description);
  for (const item of ITEMS) {
    if (item.effects.some(raidPerk)) assert.equal(item.raidDrop, true, `${item.id} has a raid perk, so only raids should give it`);
  }
  const seen = new Map<string, string>();
  // (The unique weapons share their ATK perk: what sets each apart is its own effect in the raid, its hero's. TechnoMagic
  // gear has no perks: each copy's stats are its own potentials.)
  for (const item of ITEMS) {
    if (item.tmDrop) continue;
    const key = `${item.stars}:${[...item.effects].sort().join('+')}${item.uniqueWeapon ? `:${item.uniqueWeapon}` : ''}`;
    assert.ok(!seen.has(key), `${item.id} does the same as ${seen.get(key)}`);
    seen.set(key, item.id);
  }
});

test('retired items: gone from the catalog, each swapped for a raid drop (or, for TechnoMagic gear, TechnoMagic gear) that is still in it', () => {
  for (const [from, to] of Object.entries(RETIRED_ITEMS)) {
    assert.equal(ITEMS_BY_ID.get(from), undefined, from);
    const kept = ITEMS_BY_ID.get(to);
    assert.ok(kept?.raidDrop || kept?.tmDrop, to);
    if (kept?.raidDrop) assert.equal(kept.effects.length, 1, to);
  }
});

test('raid drops: the party rolls once, and on a hit every raider finds one of the raid drops', () => {
  const asked: number[] = [];
  let next = 0;
  // Level 1's (the drop when no difficulty is given): one 3-star each.
  const pool = RAID_DROPS.filter((item) => item.stars === 3).slice(0, 3);
  const users = ['a', 'b', 'c', 'd'];
  const hit: DropRng = { chance: (p) => (asked.push(p), true), index: (max) => next++ % max };
  assert.deepEqual(rollRaidDrops(users, 0.6, undefined, hit, pool), [
    { userId: 'a', item: pool[0] },
    { userId: 'b', item: pool[1] },
    { userId: 'c', item: pool[2] },
    { userId: 'd', item: pool[0] },
  ]);
  assert.deepEqual(asked, [0.6], 'one roll for the whole party');

  const miss: DropRng = { chance: (p) => (asked.push(p), false), index: () => assert.fail('nothing to pick on a miss') };
  assert.deepEqual(rollRaidDrops(users, 0.6, undefined, miss, pool), [], 'a miss drops nothing for anyone');
  assert.deepEqual(asked, [0.6, 0.6]);

  const always: DropRng = { chance: () => true, index: () => 0 };
  assert.deepEqual(rollRaidDrops(users, 0, undefined, always, pool), [], 'a 0% chance drops nothing, without rolling');
  assert.deepEqual(rollRaidDrops(users, 1, undefined, always, []), [], 'no raid drops in the catalog, nothing to find');
  assert.deepEqual(rollRaidDrops([], 1, undefined, always, pool), [], 'nobody to give them to');
});

test('raid difficulty: level 1 is the boss as it was, and every level past it adds HP and damage', () => {
  // Its own round numbers, so the sums are exact.
  const cfg = {
    ...DEFAULTS.raid,
    hpPerRaider: { wyrm: 1000, reaper: 1000, plague: 1000 },
    hpOverhead: { wyrm: 2, reaper: 2, plague: 2 },
    difficultyHp: 0.25,
    difficultyDamage: 0.1,
    topDamage: 0,
    gearHp: { wyrm: 0, reaper: 0, plague: 0 },
  };
  assert.deepEqual(difficultyOf(1, cfg), { level: 1, hp: 1, damage: 1, gear: false, wall: 0 });
  assert.deepEqual(difficultyOf(5, cfg), { level: 5, hp: 2, damage: 1.4, gear: true, wall: 1 });
  const top = difficultyOf(10, cfg);
  assert.ok(Math.abs(top.hp - 3.25) < 1e-9 && Math.abs(top.damage - 1.9) < 1e-9, JSON.stringify(top));
  assert.deepEqual(difficultyOf(99, cfg), top, 'never past the top level');
  // From level 8 it hits harder still: a third of topDamage more at every level, all of it at level 10.
  const harder = { ...cfg, topDamage: 0.6 };
  assert.deepEqual([1, 5, 7, 8, 9, 10].map((level) => Math.round((difficultyOf(level, harder).damage - difficultyOf(level, cfg).damage) * 100) / 100), [0, 0, 0, 0.2, 0.4, 0.6]);
  assert.equal(RAID_DIFFICULTY.topFrom, 8);
  assert.ok(findSpec('raid.topDamage'), 'it can be changed with the config command');
  assert.equal(clampDifficulty(0), 1);
  assert.equal(clampDifficulty(3.9), 3);
  assert.equal(clampDifficulty(Number.NaN), 1);
  assert.equal(clampDifficulty(7, 4), 4, 'never past what the server has unlocked');

  assert.equal(bossHpFor(6, 'wyrm', cfg, difficultyOf(1, cfg)), bossHpFor(6, 'wyrm', cfg));
  assert.equal(bossHpFor(6, 'wyrm', cfg, difficultyOf(5, cfg)), bossHpFor(6, 'wyrm', cfg) * 2);

  const easy = createRaid('wyrm', ['1', '2'], 1000, 100, 15);
  assert.equal(easy.difficulty, 1);
  assert.equal(bossMultiplier(easy), 1);
  const hard = createRaid('wyrm', ['1', '2'], 1000, 100, 15, undefined, difficultyOf(5, cfg));
  assert.equal(hard.difficulty, 5);
  assert.equal(bossMultiplier(hard), 1.4);
  assert.equal(hard.intent.multiplier, 1.4, 'its very first move already hits harder');
  hard.enrage = 2;
  assert.ok(Math.abs(bossMultiplier(hard) - 1.5 * 1.4) < 1e-9, 'on top of its enrage');
});

test('raid drops: 4-stars only at levels 5 and 10, and one more 3-star at every level in between', () => {
  const ladder = Array.from({ length: 10 }, (_, i) => raidDropCounts(i + 1));
  assert.deepEqual(ladder.map((counts) => counts[4]), [0, 0, 0, 0, 1, 0, 0, 0, 0, 2]);
  assert.deepEqual(ladder.map((counts) => counts[3]), [1, 2, 3, 4, 4, 5, 6, 7, 8, 8]);
  assert.deepEqual(raidDropCounts(0), raidDropCounts(1));
  assert.deepEqual(raidDropCounts(50), raidDropCounts(10));
  assert.equal(lootKindsText(1), 'a 3★ raid item');
  assert.equal(lootKindsText(2), '2× 3★ raid items');
  assert.equal(lootKindsText(5), '1× 4★ and 4× 3★ raid items');
  assert.equal(lootKindsText(6), '5× 3★ raid items', 'no 4-star past the milestone');
  assert.equal(lootKindsText(10), '2× 4★ and 8× 3★ raid items');

  // Each raider finds that many of each tier, their best first, each from its own tier's items.
  let next = 0;
  const rng: DropRng = { chance: () => true, index: (max) => next++ % max };
  const drops = rollRaidDrops(['a', 'b'], 1, raidDropCounts(5), rng);
  assert.equal(drops.length, 10);
  for (const userId of ['a', 'b']) {
    assert.deepEqual(drops.filter((drop) => drop.userId === userId).map((drop) => drop.item.stars), [4, 3, 3, 3, 3], userId);
  }
  assert.ok(drops.every((drop) => drop.item.raidDrop));
  // The levels in between drop no 4-star at all.
  assert.deepEqual(rollRaidDrops(['a'], 1, raidDropCounts(6), rng).map((drop) => drop.item.stars), [3, 3, 3, 3, 3]);
  // A tier with nothing to drop is left out, the rest still drop.
  const fourOnly = RAID_DROPS.filter((item) => item.stars === 4);
  assert.deepEqual(rollRaidDrops(['a'], 1, raidDropCounts(5), rng, fourOnly).map((drop) => drop.item.stars), [4]);
  assert.deepEqual(rollRaidDrops(['a'], 1, raidDropCounts(4), rng, fourOnly), []);
});

test('raid drops: a raider with several is listed on one line, and My loot shows a raider their own', () => {
  const state = createRaid('wyrm', ['1', '2'], 1000, 100, 15);
  state.outcome = 'won';
  const fang = ITEMS_BY_ID.get('godslayer-fang') as ItemDef;
  const tooth = ITEMS_BY_ID.get('wyvern-tooth') as ItemDef;
  const drops = [
    { userId: '1', item: fang, isNew: true },
    { userId: '1', item: tooth, isNew: false },
    { userId: '1', item: tooth, isNew: false },
    { userId: '2', item: fang, isNew: false },
  ];
  const embed = resultEmbed(state, DEFAULTS.raid, { failed: [], drops });
  assert.equal(
    embed.toJSON().fields?.find((f) => f.name === TEXT.raid.lootField)?.value,
    '<@1> found ★★★★ **Godslayer Fang**, ★★★ **Wyvern Tooth** ×2\n<@2> found ★★★★ **Godslayer Fang**!',
  );
  const mine = myLootEmbed('1', drops)?.toJSON();
  assert.equal(mine?.title, TEXT.raid.lootMineTitle);
  const lines = (mine?.description ?? '').split('\n');
  assert.equal(lines.length, 2);
  assert.ok(lines[0]?.includes('**Godslayer Fang**') && lines[0].endsWith('🆕'), lines[0]);
  assert.ok(lines[1]?.includes('**Wyvern Tooth** ×2') && !lines[1].includes('🆕'), lines[1]);
  assert.equal(myLootEmbed('3', drops), null, 'someone who found nothing');
});

test("raid drops: the party's chance is 20% plus 10% for each raider, up to 100%", () => {
  const cfg = DEFAULTS.raid;
  const close = (actual: number, expected: number, what: string): void => assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}`);
  close(raidDropChance(1, cfg), 0.3, 'solo');
  close(raidDropChance(4, cfg), 0.6, 'four raiders');
  close(raidDropChance(7, cfg), 0.9, 'seven raiders');
  assert.equal(raidDropChance(8, cfg), 1);
  assert.equal(raidDropChance(20, cfg), 1, 'capped at 100%');
  close(raidDropChance(0, cfg), 0.2, 'the base chance');
  assert.equal(raidDropChance(5, { dropChance: 0, dropChancePerRaider: 0 }), 0);
  assert.ok(raidDropsOn(cfg));
  assert.ok(raidDropsOn({ dropChance: 0, dropChancePerRaider: 0.1 }), 'on with only the per-raider chance');
  assert.ok(!raidDropsOn({ dropChance: 0, dropChancePerRaider: 0 }));
});

test('raid drops: the chances are settings, 20% and +10% per raider by default, shown in the lobby rewards and `raid stats`', () => {
  assert.equal(DEFAULTS.raid.dropChance, 0.2);
  assert.equal(DEFAULTS.raid.dropChancePerRaider, 0.1);
  assert.ok(findSpec('raid.dropChance'), 'it can be changed with the config command');
  assert.ok(findSpec('raid.dropChancePerRaider'), 'it can be changed with the config command');
  const rewards = (cfg: typeof DEFAULTS.raid): string => bossInfoEmbed(cfg).toJSON().fields?.find((f) => f.name === 'Rewards')?.value ?? '';
  assert.ok(rewards(DEFAULTS.raid).includes(TEXT.raid.dropChance('20%', '10%')), rewards(DEFAULTS.raid));
  assert.match(rewards(DEFAULTS.raid), /everyone finds a 3★ raid item/);
  assert.ok(!rewards({ ...DEFAULTS.raid, dropChance: 0, dropChancePerRaider: 0 }).includes('★'), 'left out when drops are off');
});

test('raid drops: the result screen after a win lists what each raider found', () => {
  const low: RaidRng = { int: (min) => min, chance: () => false, pick: (items) => items[0] as never };
  const state = createRaid('wyrm', ['1', '2'], 1000, 100, 15, low);
  state.outcome = 'won';
  const item = ITEMS_BY_ID.get('godslayer-fang') as ItemDef;
  const loot = (embed: ReturnType<typeof resultEmbed>): string | undefined => embed.toJSON().fields?.find((f) => f.name === TEXT.raid.lootField)?.value;

  assert.equal(loot(resultEmbed(state, DEFAULTS.raid, { failed: [], drops: [{ userId: '2', item }] })), '<@2> found ★★★★ **Godslayer Fang**!');
  assert.equal(loot(resultEmbed(state, DEFAULTS.raid, { failed: [], drops: [] })), TEXT.raid.noLoot);
  assert.equal(loot(resultEmbed(state, { ...DEFAULTS.raid, dropChance: 0, dropChancePerRaider: 0 }, { failed: [], drops: [] })), undefined, 'no loot field when drops are off');
  assert.equal(loot(resultEmbed(state, DEFAULTS.raid, null)), undefined, 'no loot field when nobody was rewarded (a test raid)');
});

test('raid drops: the databank says where to get them', () => {
  const item = ITEMS_BY_ID.get('colossus-plate') as ItemDef;
  // From raid bosses, and (a raid item the raid shop sells) from the shop, at its tier's price.
  assert.ok(itemBlock(item).endsWith(TEXT.databank.raidDropOrShop));
  const where = itemDetail(item).fields.find((f) => f.name === TEXT.databank.detailRaidDropField)?.value ?? '';
  assert.ok(where.startsWith(TEXT.databank.detailRaidDrop), where);
  assert.ok(where.includes(`sells it for **${DEFAULTS.raid.shop.price[4]}** `), where);
  const pulled = ITEMS_BY_ID.get('starfall-blade') as ItemDef;
  assert.ok(!itemBlock(pulled).includes(TEXT.databank.raidDrop));
});

test('raid difficulty: the boss gains HP for every raider in equal steps up to level 5, where a party needs gear', () => {
  assert.equal(RAID_DIFFICULTY.gearFrom, 5);
  for (let level = 1; level <= RAID_DIFFICULTY.max; level++) {
    assert.equal(needsGear(level), level >= 5, `level ${level}`);
    assert.equal(difficultyOf(level, DEFAULTS.raid).gear, level >= 5, `level ${level}`);
  }
  // None at level 1, a quarter more at every level up to 5, and all of it from there: no sudden wall.
  assert.deepEqual(
    Array.from({ length: RAID_DIFFICULTY.max }, (_, i) => gearWallShare(i + 1)),
    [0, 0.25, 0.5, 0.75, 1, 1, 1, 1, 1, 1],
  );
  assert.equal(difficultyOf(3, DEFAULTS.raid).wall, 0.5);
  // Its own numbers, so the sums are exact: 1,000 HP a raider past the first 2, +10% a level, and 300 a raider on top.
  const cfg = { ...DEFAULTS.raid, hpPerRaider: { wyrm: 1000, reaper: 1000, plague: 1000 }, hpOverhead: { wyrm: 2, reaper: 2, plague: 2 }, minRaiders: 4, difficultyHp: 0.1, gearHp: { wyrm: 300, reaper: 0, plague: 150 } };
  assert.equal(bossHpFor(6, 'wyrm', cfg, difficultyOf(1, cfg)), 4000, 'level 1: none of it');
  assert.equal(bossHpFor(6, 'wyrm', cfg, difficultyOf(2, cfg)), 4400 + 6 * 75, 'a quarter of it at level 2');
  assert.equal(bossHpFor(6, 'wyrm', cfg, difficultyOf(4, cfg)), 5200 + 6 * 225, 'three quarters at level 4');
  assert.equal(bossHpFor(6, 'wyrm', cfg, difficultyOf(5, cfg)), 5600 + 6 * 300, 'for every raider, the overhead ones too');
  assert.equal(bossHpFor(6, 'wyrm', cfg, difficultyOf(6, cfg)), 6000 + 6 * 300, 'the same on top at every level past it');
  assert.equal(bossHpFor(2, 'wyrm', cfg, difficultyOf(5, cfg)), 2800 + 4 * 300, 'a small party is counted as the fewest raiders');
  assert.equal(bossHpFor(6, 'plague', cfg, difficultyOf(5, cfg)), 5600 + 6 * 150, 'each boss its own');
  assert.equal(bossHpFor(6, 'reaper', cfg, difficultyOf(5, cfg)), 5600, 'none: only as hard as its level makes it');

  // The defaults: every boss has some, and the settings to change it.
  for (const boss of RAID_BOSS_IDS) {
    assert.ok(DEFAULTS.raid.gearHp[boss] > 0, boss);
    assert.ok(findSpec(`raid.gearHp.${boss}`), boss);
    assert.ok(bossHpFor(5, boss, DEFAULTS.raid, difficultyOf(5, DEFAULTS.raid)) > bossHpFor(5, boss, DEFAULTS.raid, difficultyOf(1, DEFAULTS.raid)) + 5 * DEFAULTS.raid.gearHp[boss]);
  }

  // What the raiders are told: in the lobby, in its picker, and with the boss.
  // The lobby and the picker say the HP a level adds for every raider, and nothing about needing gear.
  const lobby = TEXT.raid.lobbyDifficulty(5, 5, 10, '1.12x', '1.08x', 'loot', '250');
  assert.ok(lobby.includes('1.12x HP +250 a raider'), lobby);
  assert.doesNotMatch(lobby, /gear/i);
  const fourth = TEXT.raid.lobbyDifficulty(4, 5, 10, '1.09x', '1.06x', 'loot', '188');
  assert.ok(fourth.includes('1.09x HP +188 a raider'), fourth);
  assert.doesNotMatch(TEXT.raid.lobbyDifficulty(1, 5, 10, '1x', '1x', 'loot'), /a raider/);
  assert.equal(TEXT.raid.difficultyOptionDescription('1.06x', '1.03x', '4× 3★ raid items', '188'), '1.06x HP +188/raider · 1.03x damage · drops 4× 3★ raid items');
  assert.equal(TEXT.raid.difficultyOptionDescription('1.09x', '1.06x', '4× 3★ raid items'), '1.09x HP · 1.06x damage · drops 4× 3★ raid items');
  const info = bossInfoEmbed(DEFAULTS.raid, 'reaper').toJSON().description ?? '';
  assert.ok(info.includes(`in equal steps up to **${DEFAULTS.raid.gearHp.reaper}** at level 5 and every level past it`), info);
  assert.doesNotMatch(info, /raid gear|gear levels/i);
  assert.doesNotMatch(bossInfoEmbed({ ...DEFAULTS.raid, gearHp: { wyrm: 0, reaper: 0, plague: 0 } }, 'reaper').toJSON().description ?? '', /HP by level/);
});
