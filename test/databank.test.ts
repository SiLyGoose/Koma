import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import { DATABANK_PAGE_LENGTH, FIELD_MAX_LENGTH, SLOT_LABELS, TEXT, validateConstants } from '../src/constants.js';
import { ITEMS, findItem } from '../src/data/items.js';
import type { Message } from 'discord.js';
import { messageContext } from '../src/discord/context.js';
import { databank } from '../src/commands/databank.js';
import { buildDatabank, itemBlock, itemDetail, parseStarQuery } from '../src/lib/game/databank.js';
import { describeEffects } from '../src/lib/game/equipment.js';
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

// ---------------------------------------------------------------------------
// `databank <item>`: one item in full

test('databank item: the details show the name and stars, flavor text, slot, and every effect', () => {
  const item: ItemDef = { id: 'sword', name: 'Big Sword', stars: 3, slot: 'weapon', description: 'It is big.', effects: ['robChance', 'robAmount'] };
  const detail = itemDetail(item);
  assert.equal(detail.title, '★★★  Big Sword');
  assert.equal(detail.description, '*It is big.*');
  const byName = Object.fromEntries(detail.fields.map((f) => [f.name, f.value]));
  assert.equal(byName[TEXT.databank.detailSlotField], 'Weapon');
  assert.equal(byName[TEXT.databank.detailEffectsField], describeEffects(item).join('\n'));
  assert.equal(describeEffects(item).length, 2);
  assert.equal(TEXT.databank.detailExclusiveField in byName, false, 'nothing about exclusivity for a normal item');
});

test('databank item: an exclusive item names who can use it, and an item with no effects or flavor text says so plainly', () => {
  const excl: ItemDef = { ...made('e', 4, []), usableBy: ['123456789012345678', '223456789012345678'] };
  const detail = itemDetail(excl);
  const byName = Object.fromEntries(detail.fields.map((f) => [f.name, f.value]));
  assert.equal(byName[TEXT.databank.detailEffectsField], TEXT.databank.noEffects);
  assert.equal(byName[TEXT.databank.detailExclusiveField], 'Only <@123456789012345678>, <@223456789012345678> can use its effects. Anyone can pull and equip it.');
  assert.equal(detail.description, '', 'no flavor text means no description line');
});

test('databank item: strengths come from the live settings', () => {
  const item = made('live', 1, ['robChance']);
  const before = CONFIG.equipment.robChance[1];
  try {
    CONFIG.equipment.robChance[1] = 0.33;
    const detail = itemDetail(item);
    assert.match(detail.fields.find((f) => f.name === TEXT.databank.detailEffectsField)?.value ?? '', /33%/);
  } finally {
    CONFIG.equipment.robChance[1] = before;
  }
});

test('databank item: it can be found by id, by name, or by part of the name, ignoring case and punctuation', () => {
  for (const item of ITEMS) {
    for (const query of [item.id, item.name, item.name.toUpperCase(), item.id.toUpperCase()]) {
      const found = findItem(query);
      assert.equal(found.kind, 'found', `${query}`);
      if (found.kind === 'found') assert.equal(found.item.id, item.id);
    }
  }
  const coat = ITEMS.find((i) => i.name.includes("'"));
  if (coat) assert.equal((findItem(coat.name.replace(/'/g, '')) as { item?: ItemDef }).item?.id, coat.id);
  assert.equal(findItem('definitely not an item').kind, 'none');
  assert.equal(findItem('   ').kind, 'none');
});

test('databank item: the messages', () => {
  assert.equal(TEXT.databank.noSuchItem('k!', 'zzz'), 'There is no item called "zzz". `k!databank` lists every item.');
  assert.equal(TEXT.databank.ambiguous(['A', 'B']), 'That could be more than one item: **A**, **B**. Type more of the name.');
});

// ---------------------------------------------------------------------------
// One star tier (`databank 3`)

test('databank tier: a number, a star word or star symbols name a tier', () => {
  for (const [text, stars] of [
    ['3', 3],
    [' 2 ', 2],
    ['3 star', 3],
    ['3 stars', 3],
    ['3-star', 3],
    ['3star', 3],
    ['3*', 3],
    ['3 *', 3],
    ['star 3', 3],
    ['Stars 4', 4],
    ['4 STAR', 4],
    ['\u2605', 1],
    ['\u2605\u2605\u2605', 3],
  ] as const) {
    assert.deepEqual(parseStarQuery(text), { kind: 'tier', stars }, text);
  }
});

test('databank tier: a number that is not a tier is refused, and item names are left alone', () => {
  for (const text of ['0', '5', '10', '5 star', '\u2605\u2605\u2605\u2605\u2605', 'stars 9']) {
    assert.deepEqual(parseStarQuery(text), { kind: 'bad_tier' }, text);
  }
  for (const text of ['', '  ', 'c4', 'frog', 'wheelchair', 'star', 'stars', '3 rusty', 'x3', 'kippah 3', 'four']) {
    assert.equal(parseStarQuery(text), null, text);
  }
  // No catalog item can be mistaken for a tier: none is named with only a number or star symbols.
  for (const item of ITEMS) {
    assert.equal(parseStarQuery(item.name), null, item.name);
    assert.equal(parseStarQuery(item.id), null, item.id);
  }
});

/** Runs the databank command with a stand-in message and returns every reply. */
async function ask(...words: string[]): Promise<{ title?: string | null; description?: string | null; fields: { name: string; value: string }[]; footer?: string; content?: string }[]> {
  const replies: any[] = [];
  const message = {
    author: { toString: () => '<@1>' },
    reply: async (options: any) => {
      replies.push(options);
      return { edit: async () => undefined };
    },
  } as unknown as Message<true>;
  await databank.execute(messageContext(message, words, 'k!'));
  return replies.map((r) => (r.embeds ? { ...r.embeds[0].data, fields: r.embeds[0].data.fields ?? [], footer: r.embeds[0].data.footer?.text } : { fields: [], content: String(r.content ?? r) }));
}

test('databank tier: shows every item of that tier and nothing from the others', async () => {
  for (const stars of [1, 2, 3, 4] as const) {
    const mine = ITEMS.filter((item) => item.stars === stars);
    const others = ITEMS.filter((item) => item.stars !== stars);
    for (const words of [[String(stars)], [String(stars), 'star'], ['\u2605'.repeat(stars)]]) {
      const replies = await ask(...words);
      assert.equal(replies.length, 1, `${words.join(' ')}: one message`);
      const reply = replies[0]!;
      assert.equal(reply.title, TEXT.databank.tierTitle('\u2605'.repeat(stars)));
      assert.equal(reply.description, TEXT.databank.tierDescription('\u2605'.repeat(stars)));
      // A tier's fields normally fit in one, but a big-enough tier legitimately spills into a
      // "(continued)" field (buildDatabank's own field-limit logic, tested separately) — so the
      // expected field names are whatever buildDatabank itself produces for just this tier.
      const expectedFields = buildDatabank(mine)[0] ?? [];
      assert.deepEqual(reply.fields.map((f) => f.name), expectedFields.map((f) => f.name));
      const text = reply.fields.map((f) => f.value).join('\n');
      for (const item of mine) {
        assert.ok(text.includes(`**${item.name}** \u00b7 ${SLOT_LABELS[item.slot]}`), `${item.name} is listed`);
        for (const line of describeEffects(item)) assert.ok(text.includes(line), `${item.name}: ${line}`);
      }
      for (const item of others) assert.ok(!text.includes(`**${item.name}**`), `${item.name} is left out of ${stars}-star`);
      assert.equal(reply.footer, TEXT.databank.footer('k!'));
    }
  }
});

test('databank tier: a number that is not a tier gets a hint, and nothing is listed', async () => {
  for (const word of ['0', '5', '12']) {
    const replies = await ask(word);
    assert.equal(replies.length, 1);
    assert.equal(replies[0]?.content, TEXT.databank.badTier('k!', 1, 4));
  }
  assert.match(TEXT.databank.badTier('k!', 1, 4), /1 to 4/);
});

test('databank tier: the whole list, and one item by name, still work', async () => {
  const all = await ask();
  assert.equal(all[0]?.title, TEXT.databank.title);
  // One field per star tier, unless a tier is long enough to spill into a "(continued)" field —
  // buildDatabank is the source of truth for exactly how many that produces.
  const expectedPages = buildDatabank(ITEMS);
  assert.equal(all[0]?.fields.length, expectedPages[0]?.length);

  const item = ITEMS[0] as ItemDef;
  const one = await ask(item.id);
  assert.equal(one[0]?.title, TEXT.databank.detailTitle('\u2605'.repeat(item.stars), item.name));
  const byName = await ask(...item.name.split(' '));
  assert.equal(byName[0]?.title, one[0]?.title);
});
