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

test('wheel line: the points it added come after the multiplier, and are left out when there are none', () => {
  assert.equal(TEXT.wheel.landed('1.5x'), 'The wheel landed on **1.5x**.');
  assert.equal(TEXT.wheel.landed('1.5x', '+50'), `The wheel landed on **1.5x** (**+50** ${CURRENCY_EMOJI}).`);
  assert.equal(TEXT.wheel.landed('0.4x', '-90'), `The wheel landed on **0.4x** (**-90** ${CURRENCY_EMOJI}).`);
});

test('D20 lines: the points the die added come after the multiplier, and are left out when there are none', () => {
  assert.equal(TEXT.d20.landed(13, '1.3x'), 'The D20 landed on **13**: **1.3x**.');
  assert.equal(TEXT.d20.landed(13, '1.3x', '+120'), `The D20 landed on **13**: **1.3x** (**+120** ${CURRENCY_EMOJI}).`);
  assert.equal(TEXT.d20.landed(4, '0.4x', '-240'), `The D20 landed on **4**: **0.4x** (**-240** ${CURRENCY_EMOJI}).`);
  assert.equal(TEXT.d20.critical(20, 2, '2x'), 'Critical success! The D20 landed on **20**, and the d3 rolled **2**: **2x**.');
  assert.equal(TEXT.d20.critical(20, 2, '2x', '+400'), `Critical success! The D20 landed on **20**, and the d3 rolled **2**: **2x** (**+400** ${CURRENCY_EMOJI}).`);
});

test('rob lines: the robber gear and the victim armor on the receipt', () => {
  assert.equal(TEXT.rob.receiptGearAdded('40'), `🗡️ Gear added **40** ${CURRENCY_EMOJI}`);
  assert.equal(TEXT.rob.receiptGearCut('50'), `🗡️ Gear reduced by **50** ${CURRENCY_EMOJI}`);
  assert.equal(TEXT.rob.receiptArmor('<@2>', '48'), `🛡️ <@2>'s armor reduced by **48** ${CURRENCY_EMOJI}`);
});
