import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TEXT } from '../src/constants/index.js';
import { ITEMS_BY_ID } from '../src/data/items.js';
import { autoLocked } from '../src/lib/game/heroes.js';
import type { ItemDef } from '../src/types.js';

test('lock: a button per kind of copy says its level, how many, and whether one is worn', () => {
  assert.equal(TEXT.lock.button(5, 1, false), '★5');
  assert.equal(TEXT.lock.button(1, 7, false), '★1 ×7');
  assert.equal(TEXT.lock.button(4, 1, true), '★4 · equipped');
  assert.equal(TEXT.lock.done('Iron Longsword', 5, 'lock'), "🔒 Locked your **★5 Iron Longsword**. It can't be sold or used up by a refine.");
  assert.equal(TEXT.lock.nothingTo('Iron Longsword', 'unlock'), 'None of your **Iron Longsword** is locked.');
});

test("lock: a new copy locks by itself when it is the members' own 4★, but of a hero's gear only its T10", () => {
  const find = (is: (item: ItemDef) => boolean): ItemDef => [...ITEMS_BY_ID.values()].find(is) ?? assert.fail('no such item');
  assert.equal(autoLocked(find((item) => item.id === 'worldbreaker-maul')), true);
  assert.equal(autoLocked(find((item) => item.uniqueWeapon !== undefined)), true);
  assert.equal(autoLocked(find((item) => item.uniqueTreasure !== undefined)), true);
  assert.equal(autoLocked(find((item) => item.kr?.part === 'artifact')), true);
  assert.equal(autoLocked(find((item) => item.kr?.tier === 9)), false);
  assert.equal(autoLocked(find((item) => item.kr?.tier === 6)), false);
});
