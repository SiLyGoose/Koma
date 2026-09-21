import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_GIVE_AMOUNT, TEXT, validateConstants } from '../src/constants.js';
import { parseGiveArgs } from '../src/lib/game/give.js';

test('give: an id alone gives one, an amount gives that many, and the id is not case-sensitive', () => {
  assert.deepEqual(parseGiveArgs(['c4'], 100), { ok: true, itemId: 'c4', count: 1 });
  assert.deepEqual(parseGiveArgs(['C4'], 100), { ok: true, itemId: 'c4', count: 1 });
  assert.deepEqual(parseGiveArgs(['coughing-baby', '3'], 100), { ok: true, itemId: 'coughing-baby', count: 3 });
  assert.deepEqual(parseGiveArgs(['c4', '100'], 100), { ok: true, itemId: 'c4', count: 100 });
  assert.deepEqual(parseGiveArgs(['c4', '007'], 100), { ok: true, itemId: 'c4', count: 7 });
});

test('give: no id or extra words show the usage, and a bad amount is refused', () => {
  assert.deepEqual(parseGiveArgs([], 100), { ok: false, reason: 'usage' });
  assert.deepEqual(parseGiveArgs(['c4', '2', 'extra'], 100), { ok: false, reason: 'usage' });
  for (const bad of ['0', '101', '-1', '2.5', 'many', '1e3', '', '99999999999']) {
    assert.deepEqual(parseGiveArgs(['c4', bad], 100), { ok: false, reason: 'bad_amount' }, `amount "${bad}"`);
  }
});

test('give: the limit is a constant, and the messages fill in their values', () => {
  validateConstants();
  assert.ok(Number.isInteger(MAX_GIVE_AMOUNT) && MAX_GIVE_AMOUNT >= 1);
  assert.match(TEXT.give.usage('k!', '100'), /k!give <item id> \[amount\]/);
  assert.match(TEXT.give.badAmount('100'), /1 to 100/);
  assert.match(TEXT.give.unknownItem('zzz', '`c4`, `wheelchair`'), /"zzz".*`c4`/);
  const done = TEXT.give.done('★★★★', 'C4', 'c4', '3', '5');
  assert.match(done, /★★★★ \*\*C4\*\* \(`c4`\) ×3/);
  assert.match(done, /own 5/);
});
