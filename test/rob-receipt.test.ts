import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import { CURRENCY_EMOJI, TEXT } from '../src/constants/index.js';
import { fmt } from '../src/lib/format.js';
import { caughtReceipt, robReceipt, type RobCaughtResult, type RobReceiptResult } from '../src/commands/rob.js';

const plain: RobReceiptResult = {
  stolen: 120,
  victimBalance: 5000,
  rolled: 120,
  gearBonus: 0,
  shielded: 0,
  streak: null,
  vulnerableBonus: 0,
  d20: null,
  d20Bonus: 0,
  wealthTax: null,
  wheel: null,
  wheelBonus: 0,
  robTaxPaid: null,
  slip: null,
  claimTax: null,
  robTax: null,
};
const money = (n: string): string => `**${n}** ${CURRENCY_EMOJI}`;

test('rob receipt: a rob with nothing but the roll is one sentence', () => {
  assert.equal(robReceipt('@Z', '@I', plain), `@Z robbed @I and got away with ${money('120')}`);
});

test('rob receipt: every effect in the order it was applied, what the victim lost, then what the robber kept', () => {
  const text = robReceipt('@Z', '@I', {
    ...plain,
    stolen: 343,
    gearBonus: 30,
    shielded: 20,
    streak: { count: 3, rate: 0.1, bonus: 13 },
    wealthTax: { amount: 200, rate: 0.05 },
    wheel: { multiplier: 1.5 },
    wheelBonus: 171,
    robTaxPaid: { amount: 50, toUserId: '9' },
    claimTax: 0.1,
  });
  const lines = text.split('\n');
  assert.equal(lines[0], '**@Z robbed @I!**');
  assert.deepEqual(lines.slice(2, 7), [
    `💸 Stole ${money('120')}`,
    `🗡️ Gear added ${money('30')}`,
    `🛡️ @I's armor reduced by ${money('20')}`,
    `⌨️ Hot streak (3 robs in 6 hours, +10%) added ${money('13')}`,
    `💰 Wealth tax (5% of what @I held over ${money(fmt(CONFIG.rob.wealthTaxThreshold))}) added ${money('200')}`,
  ]);
  assert.equal(lines[8], `@I lost ${money('343')}`);
  assert.equal(lines[9], `🎡 Wheel (1.5x) added ${money('171')}`);
  assert.equal(lines[10], `🐸 Rob tax: <@9> took ${money('50')}`);
  assert.equal(lines[12], `You kept ${money('464')}`);
  assert.equal(lines.at(-1), "📌 @I's next claim will be taxed 10%.");
});

test("rob receipt: with nothing after the victim paid, it ends on what was taken; a victim who couldn't pay it all shows the difference", () => {
  const text = robReceipt('@Z', '@I', { ...plain, stolen: 130, gearBonus: 30 });
  assert.ok(text.endsWith(`You got away with ${money('130')}`));
  assert.ok(!text.includes('lost'));
  const short = robReceipt('@Z', '@I', { ...plain, stolen: 100, gearBonus: 30 });
  assert.ok(short.includes(`@I was short ${money('50')}`));
});

test('rob receipt: a slip says what went back and what the robber is left with', () => {
  const slipped = robReceipt('@Z', '@I', { ...plain, gearBonus: 30, stolen: 150, slip: { returned: 150, penalty: 15 } });
  assert.match(slipped, /@I lost .*150/);
  assert.match(slipped, /slipped!.*150.*went back to @I, plus .*15/);
  assert.ok(slipped.endsWith(`You lost ${money('15')}`));
  assert.ok(robReceipt('@Z', '@I', { ...plain, slip: { returned: 120, penalty: 0 } }).endsWith('You kept nothing.'));
});

const base = CONFIG.rob.failFine;
const caught: RobCaughtResult = { fine: base, owed: base, vulnerable: null, d20: null };

test('caught receipt: a caught rob with nothing but the base fine is one sentence', () => {
  assert.equal(caughtReceipt('@Z', '@I', caught), `@Z tried to rob @I but got caught, and paid them a fine of ${money(fmt(base))}`);
});

test('caught receipt: the base fine, every effect on it, then what the robber paid', () => {
  const owed = base * 3;
  const text = caughtReceipt('@Z', '@I', {
    fine: owed * 2,
    owed,
    vulnerable: 0.15,
    d20: { roll: 1, kind: 'fail', bonus: 2, multiplier: 0 },
  });
  assert.deepEqual(text.split('\n'), [
    '**@Z got caught robbing @I!**',
    '',
    `🚨 Fine of ${money(fmt(base))}`,
    `🗡️ Gear added ${money(fmt(owed - base))}`,
    `🎲 D20 critical fail (2x) added ${money(fmt(owed))}`,
    '━━━━━━━━━━',
    `You paid @I ${money(fmt(owed * 2))}`,
    '',
    TEXT.rob.nowVulnerable('@Z', '15%'),
  ]);
});

test("caught receipt: gear that cancels the fine, and a robber who couldn't pay it all", () => {
  const saved = caughtReceipt('@Z', '@I', { ...caught, fine: 0, owed: 0 });
  assert.ok(saved.includes(`🗡️ Gear reduced by ${money(fmt(base))}`));
  assert.ok(saved.endsWith('Your gear got you out of the fine.'));
  const short = caughtReceipt('@Z', '@I', { ...caught, fine: base - 10, owed: base * 2 });
  assert.ok(short.includes(`@Z was short ${money(fmt(base + 10))}`));
  assert.ok(short.endsWith(`You paid @I ${money(fmt(base - 10))}`));
});
