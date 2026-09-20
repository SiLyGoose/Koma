import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG, STARS, validateConfig } from '../src/config.js';
import { ITEMS, itemsByStars, validateItems } from '../src/data/items.js';
import { rollItem, rollStars } from '../src/lib/gacha.js';
import { randInt } from '../src/lib/random.js';
import { currentHour, nextHourUnix } from '../src/lib/time.js';

test('config and item catalog are valid', () => {
  validateConfig();
  validateItems();
  for (const stars of STARS) assert.ok(itemsByStars(stars).length > 0);
});

test('rollStars follows the configured weights', () => {
  const draws = 200_000;
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (let i = 0; i < draws; i++) counts[rollStars()]++;

  const total = STARS.reduce((sum, stars) => sum + CONFIG.gacha.starWeights[stars], 0);
  for (const stars of STARS) {
    const expected = CONFIG.gacha.starWeights[stars] / total;
    const actual = counts[stars] / draws;
    assert.ok(Math.abs(actual - expected) < 0.01, `${stars}-star: expected ~${expected}, got ${actual}`);
  }
});

test('rollStars can roll every tier, including 4 stars', () => {
  for (const stars of STARS) {
    const weights = { 1: 0, 2: 0, 3: 0, 4: 0, [stars]: 1 } as Record<1 | 2 | 3 | 4, number>;
    for (let i = 0; i < 50; i++) assert.equal(rollStars(weights), stars);
  }
});

test('rollItem always returns a catalog item', () => {
  for (let i = 0; i < 1000; i++) assert.ok(ITEMS.includes(rollItem()));
});

test('randInt is inclusive on both ends', () => {
  const seen = new Set<number>();
  for (let i = 0; i < 1000; i++) seen.add(randInt(1, 3));
  assert.deepEqual([...seen].sort(), [1, 2, 3]);

  for (let i = 0; i < 10_000; i++) {
    const n = randInt(CONFIG.claim.min, CONFIG.claim.max);
    assert.ok(n >= CONFIG.claim.min && n <= CONFIG.claim.max);
  }
});

test('claim hour flips exactly on the hour', () => {
  const at259 = Date.UTC(2026, 8, 20, 2, 59, 59, 999);
  const at300 = Date.UTC(2026, 8, 20, 3, 0, 0, 0);
  const at301 = Date.UTC(2026, 8, 20, 3, 1, 0, 0);

  assert.equal(currentHour(at300), currentHour(at259) + 1);
  assert.equal(currentHour(at301), currentHour(at300));
  assert.equal(nextHourUnix(currentHour(at259)), at300 / 1000);
});
