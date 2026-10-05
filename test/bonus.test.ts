import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CURRENCY_EMOJI, TEXT } from '../src/constants/index.js';
import { fmt, signed } from '../src/lib/format.js';

test('signed: a change in points is shown with its sign', () => {
  assert.equal(signed(25), '+25');
  assert.equal(signed(-90), '-90');
  assert.equal(signed(0), '0');
  assert.equal(signed(1234), `+${fmt(1234)}`);
  assert.equal(signed(-1234), `-${fmt(1234)}`);
});

test("D20 line: a rob's critical success names the roll, the d3 and the multiplier", () => {
  assert.equal(TEXT.d20.critical(20, 2, '2x'), 'Critical success! The D20 landed on **20**, and the d3 rolled **2**: **2x**.');
});

test('rob lines: the robber gear and the victim armor on the receipt', () => {
  assert.equal(TEXT.receipt.gearAdded('40'), `🗡️ Gear added **40** ${CURRENCY_EMOJI}`);
  assert.equal(TEXT.receipt.gearCut('50'), `🗡️ Gear reduced by **50** ${CURRENCY_EMOJI}`);
  assert.equal(TEXT.rob.receiptArmor('<@2>', '48'), `🛡️ <@2>'s armor reduced by **48** ${CURRENCY_EMOJI}`);
});
