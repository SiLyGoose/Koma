import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TEXT } from '../src/constants/index.js';
import { ITEMS } from '../src/data/items.js';
import { buildSlashCommand, SLASH } from '../src/discord/slash.js';
import { commandMap } from '../src/commands/index.js';
import { parseSlotWord, takeSlot } from '../src/lib/game/items/slot-filter.js';
import { SLOTS } from '../src/types.js';

test('category words: each slot, singular or plural, any case, and armour too', () => {
  assert.equal(parseSlotWord('weapon'), 'weapon');
  assert.equal(parseSlotWord('Weapons'), 'weapon');
  assert.equal(parseSlotWord('ARMOR'), 'armor');
  assert.equal(parseSlotWord('armour'), 'armor');
  assert.equal(parseSlotWord('treasures'), 'treasure');
  assert.equal(parseSlotWord('4'), null);
  assert.equal(parseSlotWord('ruby'), null);
});

test('takeSlot: finds the category anywhere and leaves the other words in order', () => {
  assert.deepEqual(takeSlot(['weapon']), { slot: 'weapon', rest: [] });
  assert.deepEqual(takeSlot(['4', 'armor']), { slot: 'armor', rest: ['4'] });
  assert.deepEqual(takeSlot(['treasure', '<@1>']), { slot: 'treasure', rest: ['<@1>'] });
  assert.deepEqual(takeSlot(['<@1>']), { slot: null, rest: ['<@1>'] });
  assert.deepEqual(takeSlot([]), { slot: null, rest: [] });
});

test("category words never clash with an item's name", () => {
  for (const item of ITEMS) for (const word of item.name.split(/\s+/)) assert.equal(parseSlotWord(word), null, `${item.name} has a category word in it`);
});

test('category filter: text, and a category option on /databank and /inventory that reads back as the word', () => {
  assert.equal(TEXT.databank.categoryTitle('Databank: ★★★★', 'Weapon'), 'Databank: ★★★★ · Weapon');
  assert.match(TEXT.databank.categoryDescription('Armor', null, 5), /^Every armor item/);
  assert.equal(TEXT.databank.noItemsInCategory('Treasure', '★'), 'There are no ★ treasure items.');
  assert.equal(TEXT.inventory.categoryTitle("Bob's inventory", 'Armor'), "Bob's inventory · Armor");
  for (const name of ['databank', 'inventory']) {
    const json = buildSlashCommand(commandMap.get(name)!, SLASH[name])!.toJSON();
    const option = json.options?.find((o) => o.name === 'category') as { choices?: { value: string }[] } | undefined;
    assert.ok(option, `/${name} has a category option`);
    assert.deepEqual(option.choices?.map((c) => c.value), [...SLOTS]);
    for (const slot of SLOTS) assert.equal(parseSlotWord(slot), slot, 'each choice reads back as its category');
  }
});
