import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TEXT } from '../src/constants/index.js';

test('lock: a button per kind of copy says its level, how many, and whether one is worn', () => {
  assert.equal(TEXT.lock.button(5, 1, false), 'R5');
  assert.equal(TEXT.lock.button(1, 7, false), 'R1 ×7');
  assert.equal(TEXT.lock.button(4, 1, true), 'R4 · equipped');
  assert.equal(TEXT.lock.done('Iron Longsword', 5, 'lock'), "🔒 Locked your **R5 Iron Longsword**. It can't be sold or used up by a refine.");
  assert.equal(TEXT.lock.nothingTo('Iron Longsword', 'unlock'), 'None of your **Iron Longsword** is locked.');
});
