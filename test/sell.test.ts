import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import type { Message } from 'discord.js';
import { CANCEL_ID, CONFIRM_ID, askToConfirm } from '../src/discord/confirm.js';
import { messageContext } from '../src/discord/context.js';
import { CONFIG, DEFAULTS } from '../src/config.js';
import { CURRENCY_EMOJI, TEXT } from '../src/constants/index.js';
import { createEmbed } from '../src/lib/embed.js';
import { equippedCopyIds, parseSellArgs, saleCount, saleLines, saleTotal, sellPrice, worstCopies, worstCopy } from '../src/lib/game/sell.js';
import { findSpec, parseInput, validateSettings } from '../src/lib/settings-spec.js';
import { ITEMS } from '../src/data/items.js';
import type { ItemDef, Stars } from '../src/types.js';

const item = (id: string, stars: Stars): ItemDef => ({ id, name: `Item ${id}`, stars, slot: 'weapon', description: '', effects: [] });

// ---------------------------------------------------------------------------
// Reading the command

test('sell: `<item>` sells one copy, `all <item>` every unworn copy, `stars <n>` a whole tier', () => {
  assert.deepEqual(parseSellArgs(['rusty', 'dagger']), { ok: true, request: { kind: 'one', query: 'rusty dagger' } });
  assert.deepEqual(parseSellArgs(['C4']), { ok: true, request: { kind: 'one', query: 'C4' } });
  assert.deepEqual(parseSellArgs(['all', 'rusty', 'dagger']), { ok: true, request: { kind: 'allOf', query: 'rusty dagger' } });
  assert.deepEqual(parseSellArgs(['ALL', 'Kippah']), { ok: true, request: { kind: 'allOf', query: 'Kippah' } });
  assert.deepEqual(parseSellArgs(['stars', '1']), { ok: true, request: { kind: 'stars', stars: 1 } });
  assert.deepEqual(parseSellArgs(['Stars', '4']), { ok: true, request: { kind: 'stars', stars: 4 } });
  assert.deepEqual(parseSellArgs(['star', '2']), { ok: true, request: { kind: 'stars', stars: 2 } });
});

test('sell: `<number> <item>` sells that many copies, and 1 is the same as no number', () => {
  assert.deepEqual(parseSellArgs(['3', 'rusty', 'dagger']), { ok: true, request: { kind: 'some', amount: 3, query: 'rusty dagger' } });
  assert.deepEqual(parseSellArgs(['2', 'C4']), { ok: true, request: { kind: 'some', amount: 2, query: 'C4' } });
  assert.deepEqual(parseSellArgs(['10', 'Kippah']), { ok: true, request: { kind: 'some', amount: 10, query: 'Kippah' } });
  assert.deepEqual(parseSellArgs(['1', 'rusty', 'dagger']), { ok: true, request: { kind: 'one', query: 'rusty dagger' } });
  assert.deepEqual(parseSellArgs(['007', 'Kippah']), { ok: true, request: { kind: 'some', amount: 7, query: 'Kippah' } });
  // The words `all` and `stars` still mean what they did.
  assert.deepEqual(parseSellArgs(['all', '3']), { ok: true, request: { kind: 'allOf', query: '3' } });
  assert.deepEqual(parseSellArgs(['stars', '3']), { ok: true, request: { kind: 'stars', stars: 3 } });
  // Not a whole number, so it is part of an item name.
  assert.deepEqual(parseSellArgs(['2.5', 'dagger']), { ok: true, request: { kind: 'one', query: '2.5 dagger' } });
  assert.deepEqual(parseSellArgs(['-1', 'dagger']), { ok: true, request: { kind: 'one', query: '-1 dagger' } });
  // No catalog item starts with a whole number, so a name can't be mistaken for an amount.
  for (const item of ITEMS) assert.ok(!/^\d+(\s|$)/.test(item.name), item.name);
});

test('sell: a number with no item, or a zero amount, is reported', () => {
  assert.deepEqual(parseSellArgs(['3']), { ok: false, error: 'missing_item' });
  assert.deepEqual(parseSellArgs(['0', 'dagger']), { ok: false, error: 'bad_amount' });
  assert.deepEqual(parseSellArgs(['000', 'dagger']), { ok: false, error: 'bad_amount' });
});

test('sell: a missing or bad part is reported', () => {
  assert.deepEqual(parseSellArgs([]), { ok: false, error: 'usage' });
  assert.deepEqual(parseSellArgs(['', '  ']), { ok: false, error: 'usage' });
  assert.deepEqual(parseSellArgs(['all']), { ok: false, error: 'missing_item' });
  for (const bad of [['stars'], ['stars', '0'], ['stars', '5'], ['stars', 'two'], ['stars', '1.5'], ['stars', '-1'], ['stars', '1', '2']]) {
    assert.deepEqual(parseSellArgs(bad), { ok: false, error: 'bad_stars' }, bad.join(' '));
  }
});

// ---------------------------------------------------------------------------
// Choosing and pricing copies

const at = (n: number) => new Date(1_700_000_000_000 + n);

test('sell: the copy sold first is the lowest level, then the newest, then the highest id', () => {
  const copies = [
    { _id: 'a', level: 1, obtainedAt: at(1) },
    { _id: 'b', level: 0, obtainedAt: at(2) },
    { _id: 'c', level: 0, obtainedAt: at(3) },
    { _id: 'd', level: 2, obtainedAt: at(4) },
  ];
  assert.equal(worstCopy(copies)?._id, 'c');
  assert.equal(worstCopy([{ _id: 'x', level: 0, obtainedAt: at(1) }, { _id: 'y', level: 0, obtainedAt: at(1) }])?._id, 'y');
  assert.equal(worstCopy([]), undefined);
  // The reverse of what gets equipped: a level 3 copy is the last to go.
  assert.equal(worstCopy([{ _id: 'hi', level: 3, obtainedAt: at(1) }, { _id: 'lo', level: 0, obtainedAt: at(9) }])?._id, 'lo');
});

test('sell: several copies go in the order one would be sold: lowest level, then newest, then highest id', () => {
  const copies = [
    { _id: 'a', level: 1, obtainedAt: at(1) },
    { _id: 'b', level: 0, obtainedAt: at(2) },
    { _id: 'c', level: 0, obtainedAt: at(3) },
    { _id: 'd', level: 2, obtainedAt: at(4) },
    { _id: 'e', level: 0, obtainedAt: at(3) },
  ];
  assert.deepEqual(worstCopies(copies, 3).map((c) => c._id), ['e', 'c', 'b']);
  assert.deepEqual(worstCopies(copies, 5).map((c) => c._id), ['e', 'c', 'b', 'a', 'd']);
  assert.deepEqual(worstCopies(copies, 99).length, 5, 'never more than there are');
  assert.deepEqual(worstCopies(copies, 0), []);
  assert.deepEqual(worstCopies([], 3), []);
  // The first of them is the one `worstCopy` picks, and asking does not change the list.
  assert.equal(worstCopies(copies, 1)[0]?._id, worstCopy(copies)?._id);
  assert.deepEqual(copies.map((c) => c._id), ['a', 'b', 'c', 'd', 'e']);
});

test('sell: the worn copies are every slot\'s id, including the unique treasure, and empty slots count for nothing', () => {
  assert.deepEqual([...equippedCopyIds({ weapon: 'w1', armor: 'a1' })].sort(), ['a1', 'w1']);
  assert.deepEqual([...equippedCopyIds({ weapon: 'w1', armor: null })], ['w1']);
  assert.deepEqual([...equippedCopyIds({ weapon: '', armor: undefined })], []);
  // A worn unique treasure (e.g. STONKS!) is protected too, not just weapon/armor.
  assert.deepEqual([...equippedCopyIds({ weapon: 'w1', armor: 'a1', treasure: 'u1' })].sort(), ['a1', 'u1', 'w1']);
  assert.deepEqual([...equippedCopyIds({ treasure: 'u1' })], ['u1']);
  assert.deepEqual([...equippedCopyIds({ treasure: null })], []);
  assert.equal(equippedCopyIds(null).size, 0);
  assert.equal(equippedCopyIds(undefined).size, 0);
});

test('sell: sale lines group by item, best tier first, priced by the live star price', () => {
  const catalog = [item('a', 1), item('b', 3), item('c', 1), item('d', 2)];
  const price = (stars: Stars) => stars * 100;
  const lines = saleLines(['c', 'a', 'c', 'b', 'nope', 'a', 'c'], catalog, price);
  assert.deepEqual(
    lines.map((l) => [l.item.id, l.count, l.each, l.total]),
    [['b', 1, 300, 300], ['a', 2, 100, 200], ['c', 3, 100, 300]],
  );
  assert.equal(saleTotal(lines), 800);
  assert.equal(saleCount(lines), 6, 'ids that are not in the catalog are left out');
  assert.deepEqual(saleLines([], catalog, price), []);
});

test('sell: prices come from the live settings', () => {
  const before = CONFIG.sell.price[2];
  try {
    CONFIG.sell.price[2] = 123;
    assert.equal(sellPrice(2), 123);
    assert.equal(saleLines(['x'], [item('x', 2)])[0]?.total, 123);
  } finally {
    CONFIG.sell.price[2] = before;
  }
});

// ---------------------------------------------------------------------------
// Settings

test('sell: there is one price setting per star tier, it starts as a whole number, and bad values are refused', () => {
  for (const stars of [1, 2, 3, 4] as const) {
    const spec = findSpec(`sell.price.${stars}`);
    assert.ok(spec, `sell.price.${stars}`);
    assert.equal(spec?.group, 'Sell');
    assert.ok(Number.isInteger(DEFAULTS.sell.price[stars]) && DEFAULTS.sell.price[stars] >= 0);
  }
  assert.deepEqual(validateSettings(structuredClone(DEFAULTS)), []);
  const spec = findSpec('sell.price.1')!;
  assert.deepEqual(parseInput(spec, '1,500'), { ok: true, value: 1500 });
  assert.deepEqual(parseInput(spec, '0'), { ok: true, value: 0 });
  for (const bad of ['-1', '1.5', 'abc', '99999999999']) assert.equal(parseInput(spec, bad).ok, false, bad);
  const broken = structuredClone(DEFAULTS);
  broken.sell.price[3] = -5;
  assert.ok(validateSettings(broken).some((problem) => problem.startsWith('sell.price.3')));
});

// ---------------------------------------------------------------------------
// Messages

test('sell: the messages', () => {
  assert.equal(TEXT.sell.soldOne('<@1>', '★', 'Rusty Dagger', '40'), `<@1> sold **Rusty Dagger** ★ for **40** ${CURRENCY_EMOJI}`);
  assert.equal(TEXT.sell.soldMany('<@1>', 4, '400'), `<@1> sold **4** items for **400** ${CURRENCY_EMOJI}`);
  assert.equal(TEXT.sell.line('★★', 'Kippah', 2, '200'), `★★  Kippah x2 · 200 ${CURRENCY_EMOJI}`);
  assert.equal(TEXT.sell.footerLeft(0), 'You have none left');
  assert.equal(TEXT.sell.footerLeft(2), 'You have 2 left');
  assert.equal(TEXT.sell.skipped(1), '1 item could not be sold any more and was kept.');
  assert.equal(TEXT.sell.skipped(3), '3 items could not be sold any more and were kept.');
  assert.equal(TEXT.sell.onlyEquipped('k!', 'Kippah'), "Your **Kippah** is in one of your loadouts, so it can't be sold. Take it off with `k!unequip` first (for a saved loadout, switch to it with `k!loadout`).");
  assert.equal(TEXT.sell.noneInTier('3-star'), "You don't own any 3-star items.");
  assert.equal(TEXT.sell.confirmDescription('200', 2, 'LINES'), `LINES\n\nTotal: **200** ${CURRENCY_EMOJI} for **2** items.`);
  assert.match(TEXT.sell.usage('k!'), /k!sell <item>.*k!sell <number> <item>.*k!sell all <item>.*k!sell stars <1-4>/);
  assert.equal(TEXT.sell.askWhichAmount('k!'), 'Which item? Use `k!sell <number> <item name>`.');
  assert.match(TEXT.sell.badAmount('k!'), /whole number, 1 or more/);
  assert.equal(
    TEXT.sell.notEnough('k!', 'Kippah', 5, 2),
    "You asked to sell 5 but you only have **2** copies of **Kippah** that aren't in a loadout. Use `k!sell all Kippah` to sell them all.",
  );
  assert.match(TEXT.sell.notEnough('k!', 'Kippah', 3, 1), /\*\*1\*\* copy of .*sell it\./);
});

// ---------------------------------------------------------------------------
// The confirmation buttons

/** A stand-in for a message and the button interactions on it. */
function fakeButtons() {
  const events: { kind: string; data?: any }[] = [];
  const collector = Object.assign(new EventEmitter(), {
    stopped: '' as string,
    stop(reason: string) {
      this.stopped = reason;
      setImmediate(() => this.emit('end', new Map(), reason));
    },
  });
  let collectorOptions: any;
  const sent = {
    edit: async (o: unknown) => {
      events.push({ kind: 'edit', data: o });
    },
    createMessageComponentCollector: (o: unknown) => {
      collectorOptions = o;
      return collector;
    },
  };
  let replyOptions: any;
  const message = {
    reply: async (o: any) => {
      replyOptions = o;
      return sent;
    },
  } as unknown as Message;
  const click = (userId: string, customId: string) => {
    const interaction = {
      user: { id: userId },
      customId,
      deferUpdate: async () => {
        events.push({ kind: 'defer', data: userId });
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
  return { message, events, collector, click, options: () => ({ collectorOptions, replyOptions }) };
}
const labels = { confirm: 'Sell', cancel: 'Cancel', notYours: 'Not yours' };
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setImmediate(resolve));
};

test('confirm: the question has a confirm and a cancel button and waits for a limited time', async () => {
  const f = fakeButtons();
  const pending = askToConfirm(messageContext(f.message as Message<true>, [], 'k!'), createEmbed().setTitle('Q'), 'u1', labels, 1234);
  await settle();
  const { collectorOptions, replyOptions } = f.options();
  assert.equal(collectorOptions.time, 1234);
  const row = replyOptions.components[0].toJSON();
  assert.deepEqual(row.components.map((c: any) => [c.custom_id, c.label]), [[CONFIRM_ID, 'Sell'], [CANCEL_ID, 'Cancel']]);
  f.click('u1', CANCEL_ID);
  await pending;
});

test('confirm: the member pressing confirm gets a confirm, and the answer replaces the question', async () => {
  const f = fakeButtons();
  const pending = askToConfirm(messageContext(f.message as Message<true>, [], 'k!'), createEmbed(), 'u1', labels);
  await settle();
  f.click('u1', CONFIRM_ID);
  const outcome = await pending;
  assert.equal(outcome.decision, 'confirm');
  assert.deepEqual(f.events.map((e) => e.kind), ['defer'], 'acknowledged straight away');
  const result = createEmbed().setTitle('Done');
  await outcome.finish([result]);
  const last = f.events[f.events.length - 1];
  assert.equal(last?.kind, 'editReply');
  assert.deepEqual(last?.data.components, [], 'the buttons are removed');
  assert.equal(last?.data.embeds[0], result);
  assert.equal(f.collector.stopped, 'answered');
});

test('confirm: cancel is a cancel', async () => {
  const f = fakeButtons();
  const pending = askToConfirm(messageContext(f.message as Message<true>, [], 'k!'), createEmbed(), 'u1', labels);
  await settle();
  f.click('u1', CANCEL_ID);
  assert.equal((await pending).decision, 'cancel');
});

test("confirm: someone else's button press is told it isn't theirs and doesn't answer the question", async () => {
  const f = fakeButtons();
  let outcome: string | undefined;
  const pending = askToConfirm(messageContext(f.message as Message<true>, [], 'k!'), createEmbed(), 'u1', labels).then((o) => {
    outcome = o.decision;
    return o;
  });
  await settle();
  f.click('stranger', CONFIRM_ID);
  await settle();
  assert.equal(outcome, undefined, 'still waiting');
  const reply = f.events.find((e) => e.kind === 'reply');
  assert.equal(reply?.data.content, 'Not yours');
  assert.ok(reply?.data.flags, 'only the stranger sees it');
  assert.equal(f.events.some((e) => e.kind === 'defer'), false);
  f.click('u1', CONFIRM_ID);
  assert.equal((await pending).decision, 'confirm');
});

test('confirm: only the first answer counts', async () => {
  const f = fakeButtons();
  const pending = askToConfirm(messageContext(f.message as Message<true>, [], 'k!'), createEmbed(), 'u1', labels);
  await settle();
  f.click('u1', CONFIRM_ID);
  f.click('u1', CANCEL_ID);
  f.click('u1', CONFIRM_ID);
  assert.equal((await pending).decision, 'confirm');
  await settle();
  assert.equal(f.events.filter((e) => e.kind === 'defer').length, 1);
});

test('confirm: with no answer it times out, and the message is edited to say so', async () => {
  const f = fakeButtons();
  const pending = askToConfirm(messageContext(f.message as Message<true>, [], 'k!'), createEmbed(), 'u1', labels);
  await settle();
  f.collector.emit('end', new Map(), 'time');
  const outcome = await pending;
  assert.equal(outcome.decision, 'timeout');
  const result = createEmbed().setTitle('Too slow');
  await outcome.finish([result]);
  const last = f.events[f.events.length - 1];
  assert.equal(last?.kind, 'edit');
  assert.deepEqual(last?.data.components, []);
  assert.equal(last?.data.embeds[0], result);
});
