import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ADMIN_USER_ID,
  EFFECT_TEXT,
  FAILURE_TITLES,
  HOUR_MS,
  MINUTE_MS,
  SLOT_LABELS,
  SUCCESS_TITLES,
  TEXT,
  validateConstants,
} from '../src/constants.js';
import { EFFECT_IDS } from '../src/data/effects.js';
import { isAdmin } from '../src/config.js';
import { formatPercent, fmt, joinLimited, mentionList, starString } from '../src/lib/format.js';
import { pickRandom } from '../src/lib/random.js';
import { HOUR_MS as HOUR_MS_FROM_TIME } from '../src/lib/time.js';
import { SLOTS } from '../src/types.js';

test('the shipped constants pass their own startup check', () => {
  validateConstants();
});

test('rob titles: every rob can pick from a non-empty list', () => {
  assert.ok(SUCCESS_TITLES.length > 0);
  assert.ok(FAILURE_TITLES.length > 0);
  for (const title of [...SUCCESS_TITLES, ...FAILURE_TITLES]) assert.ok(title.trim().length > 0);
});

test('pickRandom only returns items from the list, and eventually returns each of them', () => {
  const pool = ['a', 'b', 'c'];
  const seen = new Set<string>();
  for (let i = 0; i < 300; i++) {
    const picked = pickRandom(pool);
    assert.ok(pool.includes(picked));
    seen.add(picked);
  }
  assert.equal(seen.size, 3);
  assert.equal(pickRandom(['only']), 'only');
});

test('every effect has a gear line, and every slot has a label', () => {
  for (const id of EFFECT_IDS) assert.match(EFFECT_TEXT[id]('10%'), /10%/, `${id} should show its strength`);
  for (const slot of SLOTS) assert.ok(SLOT_LABELS[slot].length > 0);
});

test('time constants agree with each other', () => {
  assert.equal(HOUR_MS, 60 * MINUTE_MS);
  assert.equal(HOUR_MS_FROM_TIME, HOUR_MS);
});

test('the admin id is still recognised through config.ts', () => {
  assert.ok(isAdmin(ADMIN_USER_ID));
  assert.equal(isAdmin('1'), false);
});

test('formatting helpers use the constants', () => {
  assert.equal(fmt(1234567), '1,234,567');
  assert.equal(starString(3), '★★★');
  assert.equal(formatPercent(0.12345), '12.35%');
  assert.match(joinLimited(['x'.repeat(600), 'y'.repeat(600)]), /\.\.\.and 1 more$/);
});

test('message templates fill in their values', () => {
  assert.equal(TEXT.common.memberNotFound('k!', 'rob @user'), 'Could not find member in server. Mention via `k!rob @user`.');
  assert.match(TEXT.rob.success('<@1>', '<@2>', '250'), /<@1> robbed <@2>.*\*\*250\*\* points/);
  assert.match(TEXT.rob.caughtFinedWithGear('<@1>', '<@2>', '25', '75'), /fine of \*\*25\*\* points \(their gear cancelled 75\)/);
  assert.equal(TEXT.equip.ambiguous(['A', 'B']), 'That could be more than one of your items: **A**, **B**. Type more of the name.');
  assert.equal(TEXT.unequip.tookOff(['A', 'B']), 'You took off **A** and **B**.');
  assert.equal(TEXT.config.reset('claim.min', '200', '100'), 'Reset `claim.min` from **200** to **100**.');
  assert.match(TEXT.balance.claimWait(1700000000), /<t:1700000000:R>/);
  assert.equal(TEXT.balance.witheredSelf('25%', '<@1>'), 'Withered: <@1> takes 25% of your next claim.');
  assert.equal(TEXT.balance.witheredOther('25%', '<@1>'), 'Withered: <@1> takes 25% of their next claim.');
  assert.equal(TEXT.balance.robTaxSelf('25%', '<@1>'), 'Yowch, My Coins! <@1> takes 25% of your next rob.');
  assert.equal(TEXT.balance.robTaxOther('25%', '<@1>'), 'Yowch, My Coins! <@1> takes 25% of their next rob.');
  assert.equal(TEXT.databank.exclusive('<@1>, <@2>'), 'Exclusive to <@1>, <@2>');
  assert.equal(TEXT.equip.exclusive('<@1>'), 'Only <@1> can use its effects. It does nothing for you.');
  assert.equal(TEXT.gear.exclusive('<@1>'), 'Exclusive to <@1>. It does nothing for this member.');
  assert.equal(TEXT.gacha.exclusive('<@1>'), 'Only <@1> can use this one.');
  assert.equal(mentionList(['1', '2']), '<@1>, <@2>');
  assert.equal(mentionList([]), '');
  assert.equal(TEXT.rob.robTaxed('<@2>', '25%'), "<@2>'s next rob will be taxed 25%.");
  assert.equal(TEXT.rob.robTaxPaid('<@1>', '50', '150'), '<@1> took **50** of it. You kept **150**.');
});

test('the startup check catches a bad edit', () => {
  const titles = SUCCESS_TITLES as string[];
  titles.push('   ');
  try {
    assert.throws(() => validateConstants(), /SUCCESS_TITLES has an empty title/);
  } finally {
    titles.pop();
  }
  validateConstants();
});
