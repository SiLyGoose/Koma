import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CURRENCY_EMOJI, SLOT_EMOJI } from '../src/constants/index.js';
import { claimReceipt, type ClaimReceiptResult } from '../src/commands/claim.js';

const plain: ClaimReceiptResult = {
  amount: 120,
  rolled: 120,
  bonus: 0,
  treasure: null,
  wheel: null,
  wheelBonus: 0,
  d20: null,
  d20Bonus: 0,
  d20Penalty: 0,
  stonks: null,
  stonksBonus: 0,
  taxed: null,
};
const money = (n: string): string => `**${n}** ${CURRENCY_EMOJI}`;

test('claim receipt: a claim with nothing but the roll is still a receipt', () => {
  assert.deepEqual(claimReceipt('@Z', plain).split('\n'), ['**@Z claimed!**', '', `💸 Claimed ${money('120')}`, '━━━━━━━━━━', `You claimed ${money('120')}`]);
});

test('claim receipt: every effect in the order it was applied, what was claimed, then a claim tax and what was kept', () => {
  const text = claimReceipt('@Z', {
    ...plain,
    amount: 390,
    bonus: 30,
    treasure: { name: 'Chaewon Photocard', amount: 50 },
    wheel: { multiplier: 1.5 },
    wheelBonus: 100,
    d20: { roll: 13, kind: 'normal', bonus: null, multiplier: 1.3 },
    d20Bonus: 90,
    taxed: { amount: 39, toUserId: '9' },
  });
  assert.deepEqual(text.split('\n'), [
    '**@Z claimed!**',
    '',
    `💸 Claimed ${money('120')}`,
    `🗡️ Gear added ${money('30')}`,
    `${SLOT_EMOJI.treasure} Chaewon Photocard added ${money('50')}`,
    `🎡 Wheel (1.5x) added ${money('100')}`,
    `🎲 D20 rolled 13 (1.3x) added ${money('90')}`,
    '━━━━━━━━━━',
    `You claimed ${money('390')}`,
    `👶 Claim tax: <@9> took ${money('39')}`,
    '━━━━━━━━━━',
    `You kept ${money('351')}`,
  ]);
});

test('claim receipt: STONKS! has its own line', () => {
  const text = claimReceipt('@Z', { ...plain, amount: 756, stonks: 6.3, stonksBonus: 636 });
  assert.ok(text.includes(`📈 STONKS! (6.3x) added ${money('636')}`));
  assert.ok(text.endsWith(`You claimed ${money('756')}`));
});

test('claim receipt: a critical fail takes it all, then says what the d3 made the member pay the vault', () => {
  const fail = { ...plain, amount: 0, d20: { roll: 1, kind: 'fail' as const, bonus: 3, multiplier: 0.1 }, d20Bonus: -120 };
  const paid = claimReceipt('@Z', { ...fail, d20Penalty: 360 }).split('\n');
  assert.equal(paid[0], "**@Z's claim fell through!**");
  assert.equal(paid[3], `🎲 D20 rolled 1, a critical fail, and took all ${money('120')}`);
  assert.deepEqual(paid.slice(5), ['You claimed nothing.', `🎲 The d3 rolled 3 (3x): you paid the vault ${money('360')}`, '━━━━━━━━━━', `You lost ${money('360')}`]);
  assert.ok(claimReceipt('@Z', fail).endsWith('🎲 The d3 rolled 3, but you had nothing to pay the vault with.'));
});
