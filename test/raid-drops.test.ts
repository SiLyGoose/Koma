import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bossInfoEmbed, lootKindsText, myLootEmbed, resultEmbed } from '../src/commands/raid.js';
import { DEFAULTS, STARS } from '../src/config.js';
import { TEXT } from '../src/constants/index.js';
import { ITEMS, ITEMS_BY_ID, RAID_DROPS, gachaItems, itemsByStars } from '../src/data/items.js';
import { bossHpFor, bossMultiplier, clampDifficulty, createRaid, difficultyOf, type RaidRng } from '../src/lib/events/raid.js';
import { itemBlock, itemDetail } from '../src/lib/game/items/databank.js';
import { ownTreasures } from '../src/lib/game/items/gacha.js';
import { raidDropChance, raidDropCounts, raidDropsOn, rollRaidDrops, type DropRng } from '../src/lib/game/items/raid-drops.js';
import { findSpec } from '../src/lib/settings-spec.js';
import type { ItemDef } from '../src/types.js';

/*
 * Raid drops: the raid gear can't be pulled from the gacha, only found by beating a raid boss. How
 * many a win drops goes by the raid's difficulty.
 */

/** The 3-star raid gear the harder difficulties drop: one for each of the 4-star ones. */
const RAID_GEAR_3 = ['giants-hauberk', 'quarrybreaker-hammer', 'starfinder-longbow', 'wyvern-tooth', 'cherubs-sash', 'stalwart-pavise', 'whalers-lance', 'consecrated-sickle', 'apothecarys-rod'];

const RAID_GEAR = ['colossus-plate', 'worldbreaker-maul', 'moonpiercer-bow', 'godslayer-fang', 'seraphs-raiment', 'unbroken-bulwark', 'leviathan-harpoon', 'hallowed-scythe', 'plague-doctors-cane'];

test('raid drops: the raid gear is raid-only, and the gacha leaves it out of every tier', () => {
  assert.deepEqual(RAID_DROPS.map((item) => item.id).sort(), [...RAID_GEAR, ...RAID_GEAR_3].sort());
  for (const id of RAID_GEAR) assert.equal(ITEMS_BY_ID.get(id)?.stars, 4, id);
  for (const id of RAID_GEAR_3) assert.equal(ITEMS_BY_ID.get(id)?.stars, 3, id);
  // Each 3-star one has the same perks as one of the 4-star ones.
  const perks = (ids: string[]): string[] => ids.map((id) => [...(ITEMS_BY_ID.get(id)?.effects ?? [])].sort().join('+')).sort();
  assert.deepEqual(perks(RAID_GEAR_3), perks(RAID_GEAR));
  for (const stars of STARS) {
    assert.ok(gachaItems(stars).length > 0, `${stars}-star tier can still be pulled`);
    assert.ok(gachaItems(stars).every((item) => !item.raidDrop));
    assert.equal(gachaItems(stars).length + RAID_DROPS.filter((item) => item.stars === stars).length, itemsByStars(stars).length);
  }
  // Every other item is still pulled as before.
  assert.equal(ITEMS.filter((item) => !item.raidDrop).length, ITEMS.length - RAID_GEAR.length - RAID_GEAR_3.length);
  assert.ok(ownTreasures('anyone').every((item) => !item.raidDrop));
});

test('raid drops: the party rolls once, and on a hit every raider finds one of the raid drops', () => {
  const asked: number[] = [];
  let next = 0;
  const pool = RAID_DROPS.filter((item) => item.stars === 4).slice(0, 3);
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
  const cfg = DEFAULTS.raid;
  assert.deepEqual(difficultyOf(1, cfg), { level: 1, hp: 1, damage: 1 });
  assert.deepEqual(difficultyOf(5, cfg), { level: 5, hp: 2, damage: 1.4 });
  const top = difficultyOf(10, cfg);
  assert.ok(Math.abs(top.hp - 3.25) < 1e-9 && Math.abs(top.damage - 1.9) < 1e-9, JSON.stringify(top));
  assert.deepEqual(difficultyOf(99, cfg), top, 'never past the top level');
  assert.equal(clampDifficulty(0), 1);
  assert.equal(clampDifficulty(3.9), 3);
  assert.equal(clampDifficulty(Number.NaN), 1);
  assert.equal(clampDifficulty(7, 4), 4, 'never past what the server has unlocked');

  assert.equal(bossHpFor(6, 'wyrm', cfg, 1), bossHpFor(6, 'wyrm', cfg));
  assert.equal(bossHpFor(6, 'wyrm', cfg, difficultyOf(5, cfg).hp), bossHpFor(6, 'wyrm', cfg) * 2);

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

test('raid drops: one more 4-star at levels 5 and 10, and one more 3-star at every level in between', () => {
  const ladder = Array.from({ length: 10 }, (_, i) => raidDropCounts(i + 1));
  assert.deepEqual(ladder.map((counts) => counts[4]), [1, 1, 1, 1, 2, 2, 2, 2, 2, 3]);
  assert.deepEqual(ladder.map((counts) => counts[3]), [0, 1, 2, 3, 3, 4, 5, 6, 7, 7]);
  assert.deepEqual(raidDropCounts(0), raidDropCounts(1));
  assert.deepEqual(raidDropCounts(50), raidDropCounts(10));
  assert.equal(lootKindsText(1), 'a 4★ raid item');
  assert.equal(lootKindsText(2), '1× 4★ and 1× 3★ raid items');
  assert.equal(lootKindsText(10), '3× 4★ and 7× 3★ raid items');

  // Each raider finds that many of each tier, their best first, each from its own tier's items.
  let next = 0;
  const rng: DropRng = { chance: () => true, index: (max) => next++ % max };
  const drops = rollRaidDrops(['a', 'b'], 1, raidDropCounts(5), rng);
  assert.equal(drops.length, 10);
  for (const userId of ['a', 'b']) {
    assert.deepEqual(drops.filter((drop) => drop.userId === userId).map((drop) => drop.item.stars), [4, 4, 3, 3, 3], userId);
  }
  assert.ok(drops.every((drop) => drop.item.raidDrop));
  // A tier with nothing to drop is left out, the rest still drop.
  const fourOnly = RAID_DROPS.filter((item) => item.stars === 4);
  assert.deepEqual(rollRaidDrops(['a'], 1, raidDropCounts(4), rng, fourOnly).map((drop) => drop.item.stars), [4]);
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
  const embed = resultEmbed(state, DEFAULTS.raid, new Date('2026-10-03T04:00:00Z'), { failed: [], drops });
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
  assert.ok(!rewards({ ...DEFAULTS.raid, dropChance: 0, dropChancePerRaider: 0 }).includes('4★'), 'left out when drops are off');
});

test('raid drops: the result screen after a win lists what each raider found', () => {
  const low: RaidRng = { int: (min) => min, chance: () => false, pick: (items) => items[0] as never };
  const state = createRaid('wyrm', ['1', '2'], 1000, 100, 15, low);
  state.outcome = 'won';
  const next = new Date('2026-10-10T04:00:00Z');
  const item = ITEMS_BY_ID.get('godslayer-fang') as ItemDef;
  const loot = (embed: ReturnType<typeof resultEmbed>): string | undefined => embed.toJSON().fields?.find((f) => f.name === TEXT.raid.lootField)?.value;

  assert.equal(loot(resultEmbed(state, DEFAULTS.raid, next, { failed: [], drops: [{ userId: '2', item }] })), '<@2> found ★★★★ **Godslayer Fang**!');
  assert.equal(loot(resultEmbed(state, DEFAULTS.raid, next, { failed: [], drops: [] })), TEXT.raid.noLoot);
  assert.equal(loot(resultEmbed(state, { ...DEFAULTS.raid, dropChance: 0, dropChancePerRaider: 0 }, next, { failed: [], drops: [] })), undefined, 'no loot field when drops are off');
  assert.equal(loot(resultEmbed(state, DEFAULTS.raid, next, null)), undefined, 'no loot field when nobody was rewarded (a test raid)');
});

test('raid drops: the databank says where to get them', () => {
  const item = ITEMS_BY_ID.get('colossus-plate') as ItemDef;
  assert.ok(itemBlock(item).endsWith(TEXT.databank.raidDrop));
  assert.ok(itemDetail(item).fields.some((f) => f.name === TEXT.databank.detailRaidDropField));
  const pulled = ITEMS_BY_ID.get('troll-hide-cuirass') as ItemDef;
  assert.ok(!itemBlock(pulled).includes(TEXT.databank.raidDrop));
});
