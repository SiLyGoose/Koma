import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bossInfoEmbed, resultEmbed } from '../src/commands/raid.js';
import { DEFAULTS, STARS } from '../src/config.js';
import { TEXT } from '../src/constants/index.js';
import { ITEMS, ITEMS_BY_ID, RAID_DROPS, gachaItems, itemsByStars } from '../src/data/items.js';
import { createRaid, type RaidRng } from '../src/lib/events/raid.js';
import { itemBlock, itemDetail } from '../src/lib/game/items/databank.js';
import { ownTreasures } from '../src/lib/game/items/gacha.js';
import { rollRaidDrops, type DropRng } from '../src/lib/game/items/raid-drops.js';
import { findSpec } from '../src/lib/settings-spec.js';
import type { ItemDef } from '../src/types.js';

/*
 * Raid drops: the 4-star raid gear can't be pulled from the gacha, only found by beating a raid boss.
 */

const RAID_GEAR = ['colossus-plate', 'worldbreaker-maul', 'moonpiercer-bow', 'godslayer-fang', 'seraphs-raiment'];

test('raid drops: the 4-star raid gear is raid-only, and the gacha leaves it out of every tier', () => {
  assert.deepEqual(RAID_DROPS.map((item) => item.id).sort(), [...RAID_GEAR].sort());
  for (const id of RAID_GEAR) assert.equal(ITEMS_BY_ID.get(id)?.raidDrop, true, id);
  assert.ok(RAID_DROPS.every((item) => item.stars === 4));
  for (const stars of STARS) {
    assert.ok(gachaItems(stars).length > 0, `${stars}-star tier can still be pulled`);
    assert.ok(gachaItems(stars).every((item) => !item.raidDrop));
    assert.equal(gachaItems(stars).length + RAID_DROPS.filter((item) => item.stars === stars).length, itemsByStars(stars).length);
  }
  // Every other item is still pulled as before.
  assert.equal(ITEMS.filter((item) => !item.raidDrop).length, ITEMS.length - RAID_GEAR.length);
  assert.ok(ownTreasures('anyone').every((item) => !item.raidDrop));
});

test('raid drops: each raider rolls the drop chance once, and a hit picks one of the raid drops', () => {
  const asked: number[] = [];
  const hits = new Set(['b', 'c']);
  let next = 0;
  const pool = RAID_DROPS.slice(0, 3);
  const users = ['a', 'b', 'c', 'd'];
  let i = 0;
  const rng: DropRng = {
    chance: (p) => (asked.push(p), hits.has(users[i++] as string)),
    index: (max) => next++ % max,
  };
  const drops = rollRaidDrops(users, 0.1, rng, pool);
  assert.deepEqual(asked, [0.1, 0.1, 0.1, 0.1]);
  assert.deepEqual(drops, [
    { userId: 'b', item: pool[0] },
    { userId: 'c', item: pool[1] },
  ]);

  const always: DropRng = { chance: () => true, index: () => 0 };
  assert.deepEqual(rollRaidDrops(users, 0, always, pool), [], 'a 0% chance drops nothing, without rolling');
  assert.deepEqual(rollRaidDrops(users, 1, always, []), [], 'no raid drops in the catalog, nothing to find');
});

test('raid drops: the chance is a setting, 10% by default, shown in the lobby rewards and `raid stats`', () => {
  assert.equal(DEFAULTS.raid.dropChance, 0.1);
  assert.ok(findSpec('raid.dropChance'), 'it can be changed with the config command');
  const rewards = (cfg: typeof DEFAULTS.raid): string => bossInfoEmbed(cfg).toJSON().fields?.find((f) => f.name === 'Rewards')?.value ?? '';
  assert.ok(rewards(DEFAULTS.raid).includes(TEXT.raid.dropChance('10%')), rewards(DEFAULTS.raid));
  assert.ok(!rewards({ ...DEFAULTS.raid, dropChance: 0 }).includes('4★'), 'left out when drops are off');
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
  assert.equal(loot(resultEmbed(state, { ...DEFAULTS.raid, dropChance: 0 }, next, { failed: [], drops: [] })), undefined, 'no loot field when drops are off');
  assert.equal(loot(resultEmbed(state, DEFAULTS.raid, next, null)), undefined, 'no loot field when nobody was rewarded (a test raid)');
});

test('raid drops: the databank says where to get them', () => {
  const item = ITEMS_BY_ID.get('colossus-plate') as ItemDef;
  assert.ok(itemBlock(item).endsWith(TEXT.databank.raidDrop));
  assert.ok(itemDetail(item).fields.some((f) => f.name === TEXT.databank.detailRaidDropField));
  const pulled = ITEMS_BY_ID.get('troll-hide-cuirass') as ItemDef;
  assert.ok(!itemBlock(pulled).includes(TEXT.databank.raidDrop));
});
