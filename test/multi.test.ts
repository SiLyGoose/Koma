import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CURRENCY_EMOJI, MULTI_PULLS, TEXT, validateConstants } from '../src/constants.js';
import { nextGuarantee, ownTreasures, rollItem, rollPulls } from '../src/lib/game/gacha.js';
import { itemsByStars } from '../src/data/items.js';
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

// Helen's own treasure is the Frog; C4 is someone else's.
const HELEN = '262072810422140929';
const NOBODY = '1';
const treasure = (id: string): ItemDef => itemsByStars(4).find((i) => i.id === id) as ItemDef;

test('guarantee: ownTreasures lists the treasures made for the member', () => {
  assert.deepEqual(ownTreasures(HELEN).map((i) => i.id), ['frog']);
  assert.deepEqual(ownTreasures(NOBODY), []);
});

test('guarantee: a treasure made for someone else sets it, your own clears it, and it never sets for a member with no treasure', () => {
  assert.equal(nextGuarantee(HELEN, treasure('c4')), true);
  assert.equal(nextGuarantee(HELEN, treasure('frog')), false);
  assert.equal(nextGuarantee(NOBODY, treasure('c4')), false);
});

test('guarantee: carried through a multi pull, and only lower tiers leave it alone', () => {
  const seen: boolean[] = [];
  const order = [item(1), treasure('c4'), item(2), treasure('frog'), item(3), treasure('c4')];
  const { items, guaranteed, counter } = rollPulls(0, order.length, true, (_n, g) => {
    seen.push(g);
    return order[seen.length - 1] as ItemDef;
  }, { userId: HELEN, guaranteed: false });
  assert.equal(items.length, 6);
  // Set after the C4, cleared after the Frog, set again after the last C4.
  assert.deepEqual(seen, [false, false, true, true, false, false]);
  assert.equal(guaranteed, true);
  assert.equal(counter, 0);
});

test('guarantee: a guaranteed treasure pull always gives the member their own treasure', () => {
  // Pull 90 is hard pity with the default settings, so it is always a treasure.
  for (let i = 0; i < 200; i++) assert.equal(rollItem(90, HELEN, true).id, 'frog');
  // Without the guarantee every treasure can come up.
  const ids = new Set<string>();
  for (let i = 0; i < 2000; i++) ids.add(rollItem(90, HELEN, false).id);
  assert.equal(ids.size, itemsByStars(4).length);
});
