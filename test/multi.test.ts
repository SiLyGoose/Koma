import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CURRENCY_EMOJI, MULTI_PULLS, TEXT, validateConstants } from '../src/constants.js';
import { rollPulls } from '../src/lib/game/gacha.js';
import type { ItemDef, Stars } from '../src/types.js';

const item = (stars: Stars): ItemDef => ({ id: `t${stars}`, name: `Test ${stars}`, stars, slot: 'weapon', description: '', effects: [] });

test('multi: the size is a sensible number and passes the startup check', () => {
  assert.ok(Number.isInteger(MULTI_PULLS) && MULTI_PULLS >= 2 && MULTI_PULLS <= 30);
  validateConstants();
});

test('multi: every pull is numbered in order, and a top-tier item starts the count over', () => {
  const numbers: number[] = [];
  // Pull number 5 (since the last 4-star) is a 4-star, everything else is a 1-star.
  const roll = (n: number) => {
    numbers.push(n);
    return item(n === 5 ? 4 : 1);
  };
  const { items, counter } = rollPulls(2, 10, true, roll);
  assert.deepEqual(numbers, [3, 4, 5, 1, 2, 3, 4, 5, 1, 2]);
  assert.deepEqual(items.map((i) => i.stars), [1, 1, 4, 1, 1, 1, 1, 4, 1, 1]);
  assert.equal(counter, 2);
});

test('multi: a 4-star on the very last pull leaves the counter at 0, and none leaves it counting', () => {
  const last = rollPulls(0, 3, true, (n) => item(n === 3 ? 4 : 2));
  assert.equal(last.counter, 0);
  const none = rollPulls(7, 10, true, () => item(2));
  assert.equal(none.counter, 17);
  assert.equal(none.items.length, 10);
});

test('multi: with pity off every pull is number 1 and the counter is meaningless', () => {
  const numbers: number[] = [];
  const { items } = rollPulls(50, 4, false, (n) => {
    numbers.push(n);
    return item(4);
  });
  assert.deepEqual(numbers, [1, 1, 1, 1]);
  assert.equal(items.length, 4);
});

test('multi: a single pull is the same as a multi of one', () => {
  const single = rollPulls(89, 1, true, (n) => item(n >= 90 ? 4 : 1));
  assert.equal(single.items[0]?.stars, 4);
  assert.equal(single.counter, 0);
  const noReset = rollPulls(10, 1, true, () => item(1));
  assert.equal(noReset.counter, 11);
});

test('multi: the messages', () => {
  assert.equal(TEXT.gacha.usage('k!'), `Use \`k!gacha\` for one pull, or \`k!gacha multi\` for ${MULTI_PULLS} pulls at once.`);
  assert.equal(
    TEXT.gacha.multiCantAfford('k!', 10, '2,800', '100'),
    `A multi pull (10 pulls) costs **2,800** ${CURRENCY_EMOJI} and you have **100** ${CURRENCY_EMOJI}. Use \`k!claim\` to earn more.`,
  );
  assert.equal(TEXT.gacha.multiTitle(10), 'Multi pull x10');
  assert.equal(TEXT.gacha.multiLine('★★', 'Kippah', false), '★★  Kippah');
  assert.equal(TEXT.gacha.multiLine('★★', 'Kippah', true), '★★  Kippah · New!');
  assert.equal(TEXT.gacha.multiLineTop('★★★★', 'C4', true), '**★★★★  C4** · New!');
  assert.equal(TEXT.gacha.multiExclusive('C4', '<@1>'), 'Only <@1> can use C4.');
  assert.equal(TEXT.gacha.multiTier('★', 9), '★ x9');
  assert.equal(TEXT.gacha.multiFooterNew(1), '1 new item!');
  assert.equal(TEXT.gacha.multiFooterNew(3), '3 new items!');
});
