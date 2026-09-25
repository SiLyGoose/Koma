import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { CONFIG } from '../src/config.js';
import { DATABANK_ITEMS_PER_PAGE, FIELD_MAX_LENGTH, SLOT_LABELS, TEXT, validateConstants } from '../src/constants/index.js';
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
  assert.ok(pages.length >= 1, 'at least one page');
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

test('databank: a long catalog is split into pages of at most DATABANK_ITEMS_PER_PAGE items, with no field over its length limit', () => {
  const items = Array.from({ length: 60 }, (_, i) => made(String(i), ((i % 4) + 1) as 1 | 2 | 3 | 4, ['robChance', 'robAmount', 'fineReduction']));
  const pages = buildDatabank(items);
  assert.ok(pages.length > 1, 'more than one page');

  let shown = 0;
  for (const page of pages) {
    assert.ok(page.length <= 25, 'at most 25 fields per embed');
    let pageItems = 0;
    for (const field of page) {
      assert.ok(field.value.length <= FIELD_MAX_LENGTH, `field of ${field.value.length} characters`);
      assert.ok(field.name.length > 0 && field.value.length > 0);
      const count = field.value.split('\n\n').length;
      pageItems += count;
      shown += count;
    }
    assert.ok(pageItems <= DATABANK_ITEMS_PER_PAGE, `a page showed ${pageItems} items, more than the book's ${DATABANK_ITEMS_PER_PAGE}-item page size`);
  }
  assert.equal(shown, 60, 'every item shows up exactly once across the pages');
  assert.ok(
    pages.flat().some((f) => /page \d+\/\d+/.test(f.name)),
    'a tier that needed more than one page numbers its own pages, instead of a "(continued)" field',
  );
  assert.ok(!pages.flat().some((f) => f.name.includes('continued')), 'no leftover "(continued)" wording');
});

test('databank: a small itemsPerPage puts fewer items on each page, and a tier that needs more than one numbers them', () => {
  const items = [made('a', 4), made('b', 4), made('c', 4)];
  const pages = buildDatabank(items, 1);
  assert.equal(pages.length, 3, 'one item per page');
  assert.deepEqual(pages.map((p) => p.map((f) => f.name)), [
    ['★★★★ (3) — page 1/3'],
    ['★★★★ (3) — page 2/3'],
    ['★★★★ (3) — page 3/3'],
  ]);
  const text = allText(pages);
  for (const item of items) assert.ok(text.includes(`**${item.name}**`));
});

test('databank: a tiny field-length limit still keeps every item whole, splitting into more fields than the item count alone would need', () => {
  const items = [
    made('a', 4, ['robChance', 'robAmount', 'fineReduction']),
    made('b', 4, ['robChance', 'robAmount', 'fineReduction']),
    made('c', 4, ['robChance', 'robAmount', 'fineReduction']),
  ];
  const oneBlockLength = itemBlock(items[0] as ItemDef).length;
  // Room for one item's text, not two: even though itemsPerPage (5) would allow all three on one
  // page, the tiny field limit forces each onto its own field instead of losing text to truncation.
  const pages = buildDatabank(items, 5, oneBlockLength + 10);
  const text = allText(pages);
  for (const item of items) assert.ok(text.includes(`**${item.name}**`), `${item.name} is not cut off`);
  for (const page of pages) for (const field of page) assert.ok(field.value.length <= oneBlockLength + 10);
  assert.equal(pages.flat().length, 3, 'three separate fields, one item each');
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
  assert.equal(byName[TEXT.databank.detailExclusiveField], 'Made for <@123456789012345678>, <@223456789012345678>. Anyone can pull and equip it, but it only works at 50% for everyone else.');
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
    ['★', 1],
    ['★★★', 3],
  ] as const) {
    assert.deepEqual(parseStarQuery(text), { kind: 'tier', stars }, text);
  }
});

test('databank tier: a number that is not a tier is refused, and item names are left alone', () => {
  for (const text of ['0', '5', '10', '5 star', '★★★★★', 'stars 9']) {
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

// ---------------------------------------------------------------------------
// The command, and its flip-through book of pages

/** How a reply (or a button-flipped edit of one) reads, whichever shape it came in as. */
const pageView = (r: any): { title?: string | null; description?: string | null; fields: { name: string; value: string }[]; footer?: string; components?: any[]; content?: string } =>
  r.embeds
    ? { ...r.embeds[0].data, fields: r.embeds[0].data.fields ?? [], footer: r.embeds[0].data.footer?.text, components: r.components }
    : { fields: [], content: String(r.content ?? r) };

/** Lets a test await the microtasks a button press's async handler needs to finish. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setImmediate(resolve));
};

/**
 * A stand-in for a message and its button collector, in the shape `paginate()` (and the discord.js
 * types it expects) needs: `message.reply(...)` returns something with `.edit` and
 * `.createMessageComponentCollector`, and `click()` fires a fake button press at the collector.
 */
function fakeMessage(userId = '1') {
  const events: { kind: string; data?: any }[] = [];
  const collector = Object.assign(new EventEmitter(), {
    stop(reason: string) {
      setImmediate(() => this.emit('end', new Map(), reason));
    },
  });
  const sent = {
    edit: async (o: unknown) => {
      events.push({ kind: 'edit', data: o });
    },
    createMessageComponentCollector: () => collector,
  };
  const replies: any[] = [];
  const message = {
    author: { id: userId, toString: () => `<@${userId}>` },
    reply: async (o: any) => {
      replies.push(o);
      return sent;
    },
  } as unknown as Message<true>;
  const click = (clickerId: string, customId: string) => {
    const interaction = {
      user: { id: clickerId },
      customId,
      deferUpdate: async () => {
        events.push({ kind: 'defer' });
      },
      editReply: async (o: unknown) => {
        events.push({ kind: 'editReply', data: o });
      },
      reply: async (o: unknown) => {
        events.push({ kind: 'reply', data: o });
      },
    };
    collector.emit('collect', interaction);
  };
  return { message, replies, events, collector, click };
}

/** Runs the databank command with a stand-in message and returns every reply it sent, as page views. */
async function ask(...words: string[]): Promise<ReturnType<typeof pageView>[]> {
  const f = fakeMessage();
  await databank.execute(messageContext(f.message as Message<true>, words, 'k!'));
  return f.replies.map(pageView);
}

test('databank tier: a number, a star word, and star symbols asking for the same tier show the same first page', async () => {
  for (const stars of [1, 2, 3, 4] as const) {
    const starLabel = '★'.repeat(stars);
    const [byNumber, byWord, bySymbol] = await Promise.all([ask(String(stars)), ask(String(stars), 'star'), ask(starLabel)]);
    for (const replies of [byNumber, byWord, bySymbol]) assert.equal(replies.length, 1, 'one message, however many pages it holds');
    assert.deepEqual(byNumber?.[0]?.fields, byWord?.[0]?.fields);
    assert.deepEqual(byWord?.[0]?.fields, bySymbol?.[0]?.fields);
  }
});

test('databank tier: shows every item of that tier across however many pages it needs, flipped through with Next, and nothing from the other tiers', async () => {
  for (const stars of [1, 2, 3, 4] as const) {
    const mine = ITEMS.filter((item) => item.stars === stars);
    const others = ITEMS.filter((item) => item.stars !== stars);
    const expectedPages = buildDatabank(mine);
    const starLabel = '★'.repeat(stars);

    const f = fakeMessage();
    await databank.execute(messageContext(f.message as Message<true>, [String(stars)], 'k!'));
    assert.equal(f.replies.length, 1, 'always just one message, however many pages it holds');

    let view = pageView(f.replies[0]);
    const seen: string[] = [];
    for (let page = 0; page < expectedPages.length; page++) {
      assert.equal(
        view.title,
        expectedPages.length > 1 ? TEXT.databank.titlePage(TEXT.databank.tierTitle(starLabel), page + 1, expectedPages.length) : TEXT.databank.tierTitle(starLabel),
        `page ${page + 1} title`,
      );
      if (page === 0) assert.equal(view.description, TEXT.databank.tierDescription(starLabel));
      assert.deepEqual(view.fields.map((fld) => fld.name), expectedPages[page]?.map((fld) => fld.name), `page ${page + 1} fields`);
      seen.push(view.fields.map((fld) => fld.value).join('\n'));

      if (page === expectedPages.length - 1) {
        assert.equal(view.footer, TEXT.databank.footer('k!'), 'the footer only shows on the last page');
      } else {
        assert.equal(view.footer, undefined, 'no footer before the last page');
        f.click('1', 'databank_next');
        await settle();
        const edited = f.events.filter((e) => e.kind === 'editReply').at(-1);
        view = pageView({ embeds: [edited?.data.embeds[0]] });
      }
    }

    const text = seen.join('\n');
    for (const item of mine) {
      assert.ok(text.includes(`**${item.name}** · ${SLOT_LABELS[item.slot]}`), `${item.name} is listed`);
      for (const line of describeEffects(item)) assert.ok(text.includes(line), `${item.name}: ${line}`);
    }
    for (const item of others) assert.ok(!text.includes(`**${item.name}**`), `${item.name} is left out of ${stars}-star`);
  }
});

test('databank: Previous is disabled on the first page and Next on the last, a single-page tier has no buttons at all', async () => {
  // 4-star, in the shipped catalog, needs more than one page; a small made-up tier does not.
  const [multi] = await ask('4');
  assert.ok((multi as any).components?.[0], 'a multi-page reply has a button row');
  const multiRow = (multi as any).components[0].toJSON();
  assert.deepEqual(multiRow.components.map((c: any) => [c.custom_id, c.disabled]), [
    ['databank_prev', true],
    ['databank_next', false],
  ]);

  const singlePageTiers = ([1, 2, 3, 4] as const).filter((stars) => buildDatabank(ITEMS.filter((item) => item.stars === stars)).length <= 1);
  if (singlePageTiers.length > 0) {
    const [single] = await ask(String(singlePageTiers[0]));
    assert.equal((single as any).components, undefined, 'nothing to flip through, so no buttons at all');
  }
});

test("databank: a press from someone else is told it isn't theirs and does not change the page", async () => {
  const f = fakeMessage('1');
  await databank.execute(messageContext(f.message as Message<true>, ['4'], 'k!'));
  f.click('stranger', 'databank_next');
  await settle();
  const strangerReply = f.events.find((e) => e.kind === 'reply');
  assert.equal(strangerReply?.data.content, TEXT.databank.notYours);
  assert.ok(!f.events.some((e) => e.kind === 'editReply'), 'nothing changed for a press that was not theirs');
});

test('databank: flipping past the last page or before the first is a no-op, and going idle takes the buttons off', async () => {
  const f = fakeMessage('1');
  await databank.execute(messageContext(f.message as Message<true>, ['4'], 'k!'));
  const pages = buildDatabank(ITEMS.filter((item) => item.stars === 4));
  assert.ok(pages.length > 1, 'the 4-star tier needs more than one page to make this test worth anything');

  // Walk off the end, then try to go past it a couple more times.
  for (let i = 0; i < pages.length + 2; i++) {
    f.click('1', 'databank_next');
    await settle();
  }
  const lastEdit = f.events.filter((e) => e.kind === 'editReply').at(-1);
  const lastView = pageView({ embeds: [lastEdit?.data.embeds[0]] });
  assert.deepEqual(lastView.fields.map((fld) => fld.name), pages[pages.length - 1]?.map((fld) => fld.name), 'stayed on the last page, did not run off the end');

  // Idling removes the buttons entirely.
  f.collector.stop('idle');
  await settle();
  const strip = f.events.filter((e) => e.kind === 'edit').at(-1);
  assert.deepEqual(strip?.data.components, []);
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
  const expectedPages = buildDatabank(ITEMS);
  assert.equal(all.length, 1, 'one message, however many pages the full catalog needs');
  assert.equal(all[0]?.title, expectedPages.length > 1 ? TEXT.databank.titlePage(TEXT.databank.title, 1, expectedPages.length) : TEXT.databank.title);
  assert.equal(all[0]?.fields.length, expectedPages[0]?.length);

  const item = ITEMS[0] as ItemDef;
  const one = await ask(item.id);
  assert.equal(one[0]?.title, TEXT.databank.detailTitle('★'.repeat(item.stars), item.name));
  const byName = await ask(...item.name.split(' '));
  assert.equal(byName[0]?.title, one[0]?.title);
});
