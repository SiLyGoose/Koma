import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import { DATABANK_PAGE_LENGTH, FIELD_MAX_LENGTH, SLOT_LABELS, validateConstants } from '../src/constants.js';
import { ITEMS } from '../src/data/items.js';
import { buildDatabank, itemBlock } from '../src/lib/databank.js';
import { describeEffects } from '../src/lib/equipment.js';
import type { ItemDef } from '../src/types.js';

const allText = (pages: ReturnType<typeof buildDatabank>) => pages.flat().map((f) => `${f.name}\n${f.value}`).join('\n');
const made = (id: string, stars: 1 | 2 | 3 | 4, effects: ItemDef['effects'] = ['robChance']): ItemDef => ({
  id,
  name: `Item ${id}`,
  stars,
  slot: 'weapon',
  description: '',
  effects,
});

test('databank: every catalog item is listed once, with its slot and every effect line', () => {
  validateConstants();
  const pages = buildDatabank(ITEMS);
  assert.equal(pages.length, 1, 'the whole catalog fits in one message');
  const text = allText(pages);
  for (const item of ITEMS) {
    assert.equal(text.split(`**${item.name}** · ${SLOT_LABELS[item.slot]}`).length - 1, 1, `${item.name} appears once`);
    for (const line of describeEffects(item)) assert.ok(text.includes(line), `${item.name}: ${line}`);
  }
});

test('databank: tiers run from the highest star count down, each headed with how many items it has', () => {
  const items = [made('a', 1), made('b', 3), made('c', 3), made('d', 4), made('e', 2)];
  const [page] = buildDatabank(items);
  assert.deepEqual(
    page?.map((f) => f.name),
    ['★★★★ (1)', '★★★ (2)', '★★ (1)', '★ (1)'],
  );
  // A tier with no items is left out.
  assert.deepEqual(buildDatabank([made('a', 1), made('b', 4)])[0]?.map((f) => f.name), ['★★★★ (1)', '★ (1)']);
});

test('databank: an item with no effects says so, and there is nothing to show for an empty catalog', () => {
  assert.match(itemBlock(made('x', 2, [])), /No effects/);
  assert.deepEqual(buildDatabank([]), []);
});

test('databank: strengths come from the live settings', () => {
  const item = made('x', 1, ['robChance']);
  const before = CONFIG.equipment.robChance[1];
  try {
    CONFIG.equipment.robChance[1] = 0.33;
    assert.match(itemBlock(item), /\+33% rob success chance/);
  } finally {
    CONFIG.equipment.robChance[1] = before;
  }
});

test('databank: a long catalog is split so no field or message goes over its limit', () => {
  const items = Array.from({ length: 60 }, (_, i) => made(String(i), ((i % 4) + 1) as 1 | 2 | 3 | 4, ['robChance', 'robAmount', 'fineReduction']));
  const pages = buildDatabank(items);
  assert.ok(pages.length > 1, 'more than one message');

  let shown = 0;
  for (const page of pages) {
    assert.ok(page.length <= 25, 'at most 25 fields per embed');
    const size = page.reduce((sum, f) => sum + f.name.length + f.value.length, 0);
    assert.ok(size <= DATABANK_PAGE_LENGTH, `page of ${size} characters`);
    for (const field of page) {
      assert.ok(field.value.length <= FIELD_MAX_LENGTH, `field of ${field.value.length} characters`);
      assert.ok(field.name.length > 0 && field.value.length > 0);
      shown += field.value.split('\n\n').length;
    }
  }
  assert.equal(shown, 60, 'every item shows up exactly once across the pages');
  assert.ok(pages.flat().some((f) => f.name.includes('(continued)')), 'a tier that needed two fields says it carries on');
});

test('databank: small limits still keep every item whole', () => {
  const items = [made('a', 4), made('b', 4), made('c', 4)];
  const pages = buildDatabank(items, 120, 300);
  const text = allText(pages);
  for (const item of items) assert.ok(text.includes(`**${item.name}**`));
  for (const page of pages) assert.ok(page.reduce((sum, f) => sum + f.name.length + f.value.length, 0) <= 300 || page.length === 1);
});

test('databank: an exclusive item names who it is for, and an open one says nothing about it', () => {
  const exclusive: ItemDef = { ...made('e', 4), usableBy: ['111111111111111111', '222222222222222222'] };
  const lines = itemBlock(exclusive).split('\n');
  assert.equal(lines.at(-1), 'Exclusive to <@111111111111111111>, <@222222222222222222>');
  assert.ok(!itemBlock(made('o', 4)).includes('Exclusive'));
  assert.ok(allText(buildDatabank([exclusive])).includes('Exclusive to <@111111111111111111>'));
});
