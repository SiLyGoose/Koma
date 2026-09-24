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
  assert.equal(TEXT.d20.critical(20, '2x'), 'Critical success! The D20 landed on **20** and paid **2x**.');
  assert.equal(TEXT.d20.critical(20, '2x', '+400'), `Critical success! The D20 landed on **20** and paid **2x** (**+400** ${CURRENCY_EMOJI}).`);
});

test('rob lines: what the robber gear, the victim armor and a raised fine did', () => {
  assert.equal(TEXT.rob.gearAdded('40'), `Your gear added **40** ${CURRENCY_EMOJI} to it.`);
  assert.equal(TEXT.rob.gearCut('50'), `Your gear took **50** ${CURRENCY_EMOJI} off it.`);
  assert.equal(TEXT.rob.shielded('<@2>', '48'), `<@2>'s armor blocked **48** ${CURRENCY_EMOJI} of it.`);
  assert.equal(TEXT.rob.fineRaised('250'), `Your gear added **250** ${CURRENCY_EMOJI} to the fine.`);
});
