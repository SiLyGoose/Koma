import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULTS } from '../src/config.js';
import { TEXT } from '../src/constants/index.js';
import { ITEMS_BY_ID } from '../src/data/items.js';
import { describeEffects, totalEffects } from '../src/lib/game/items/equipment.js';
import { SPECS } from '../src/lib/settings-spec.js';
import { emptyTotals, wealthTaxAmount, wealthTaxRate } from '../src/perks/index.js';

const EQUALIZER = ITEMS_BY_ID.get('equalizer')!;
const round = (n: number): number => Math.round(n * 1e6) / 1e6;

test('wealth tax: 1% of what the victim holds over 5k, configurable', () => {
  assert.equal(DEFAULTS.rob.wealthTaxThreshold, 5000);
  assert.equal(DEFAULTS.rob.wealthTaxRate, 0.01);
  assert.ok(SPECS.some((spec) => spec.key === 'rob.wealthTaxThreshold'));
  assert.ok(SPECS.some((spec) => spec.key === 'rob.wealthTaxRate'));

  assert.equal(wealthTaxAmount(20_000, 5000, 0.01), 150); // 1% of the 15k over the line
  assert.equal(wealthTaxAmount(20_000, 5000, 0.05), 750);
  assert.equal(wealthTaxAmount(5000, 5000, 0.01), 0, 'at the line: nothing');
  assert.equal(wealthTaxAmount(4000, 5000, 0.01), 0);
  assert.equal(wealthTaxAmount(5099, 5000, 0.01), 0, 'rounded down');
  assert.equal(wealthTaxAmount(20_000, 5000, 0), 0);
  assert.equal(wealthTaxRate(0.01, emptyTotals()), 0.01, 'no gear: the base rate');
});

test('wealth tax: the Equalizer is a 4-star weapon adding +0.5% at R1 up to +3% at R5', () => {
  assert.deepEqual({ stars: EQUALIZER.stars, slot: EQUALIZER.slot, effects: EQUALIZER.effects }, { stars: 4, slot: 'weapon', effects: ['wealthTax'] });
  const rateAt = (level: number) => round(wealthTaxRate(0.01, totalEffects([{ item: EQUALIZER, level }])));
  assert.deepEqual([1, 2, 3, 4, 5].map(rateAt), [0.015, 0.02, 0.025, 0.03, 0.04]);
  assert.match(describeEffects(EQUALIZER, 1, 5)[0]!, /\+3% wealth tax/);
  assert.match(TEXT.rob.wealthTaxed('@v', '5,000', '1%', '150'), /Wealth tax!.*@v.*5,000.*1%.*150/);
});
