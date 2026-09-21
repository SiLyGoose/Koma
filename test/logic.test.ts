import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG, STARS, validateConfig } from '../src/config.js';
import { ITEMS, itemsByStars, validateItems } from '../src/data/items.js';
import { PITY_STARS } from '../src/constants.js';
import { rollItem, rollStars, rollStarsAtPull, topChance } from '../src/lib/game/gacha.js';
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

// A 0.6% top tier with pity starting at pull 70 and guaranteed at pull 90.
const PITY_WEIGHTS = { 1: 694, 2: 250, 3: 50, 4: 6 } as Record<1 | 2 | 3 | 4, number>;
const PITY = { softStart: 70, hardPity: 90 };

test('pity: the chance is normal before softStart, climbs evenly after it, and is 100% at hard pity', () => {
  const base = 6 / 1000;
  assert.equal(PITY_STARS, 4);
  for (const n of [1, 2, 50, 69]) assert.ok(Math.abs(topChance(n, PITY_WEIGHTS, PITY) - base) < 1e-12, `pull ${n}`);

  // Boosted from pull 70, and still climbing right up to the guarantee.
  let previous = base;
  const steps: number[] = [];
  for (let n = 70; n < 90; n++) {
    const now = topChance(n, PITY_WEIGHTS, PITY);
    assert.ok(now > previous, `pull ${n} should be higher than pull ${n - 1}`);
    assert.ok(now < 1, `pull ${n} is not guaranteed yet`);
    steps.push(now - previous);
    previous = now;
  }
  assert.ok(Math.max(...steps) - Math.min(...steps) < 1e-9, 'each pull raises the chance by the same amount');

  // 80 is boosted a lot more than 70.
  assert.ok(topChance(80, PITY_WEIGHTS, PITY) > 5 * topChance(70, PITY_WEIGHTS, PITY));
  assert.equal(topChance(90, PITY_WEIGHTS, PITY), 1);
  assert.equal(topChance(91, PITY_WEIGHTS, PITY), 1);
  assert.equal(topChance(5000, PITY_WEIGHTS, PITY), 1);
});

test('pity: it does nothing when turned off (hardPity 0) or when the tier has weight 0', () => {
  const base = 6 / 1000;
  for (const n of [1, 70, 89, 90, 500]) {
    assert.ok(Math.abs(topChance(n, PITY_WEIGHTS, { softStart: 70, hardPity: 0 }) - base) < 1e-12);
    assert.equal(topChance(n, { ...PITY_WEIGHTS, 4: 0 }, PITY), 0);
  }
  for (let i = 0; i < 300; i++) {
    assert.notEqual(rollStarsAtPull(500, { ...PITY_WEIGHTS, 4: 0 }, PITY), 4);
  }
});

test('pity: softStart equal to hardPity jumps straight to the guarantee', () => {
  const sharp = { softStart: 90, hardPity: 90 };
  assert.ok(topChance(89, PITY_WEIGHTS, sharp) < 0.01);
  assert.equal(topChance(90, PITY_WEIGHTS, sharp), 1);
});

test('pity: the guaranteed pull is always the top tier', () => {
  for (let i = 0; i < 500; i++) assert.equal(rollStarsAtPull(90, PITY_WEIGHTS, PITY), PITY_STARS);
  for (let i = 0; i < 500; i++) assert.equal(rollStarsAtPull(200, PITY_WEIGHTS, PITY), PITY_STARS);
});

test('pity: before softStart the rolls follow the weights, and the boost only takes from the other tiers', () => {
  const draws = 100_000;
  const weights = { 1: 50, 2: 30, 3: 10, 4: 10 } as Record<1 | 2 | 3 | 4, number>;
  const early = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (let i = 0; i < draws; i++) early[rollStarsAtPull(5, weights, PITY)]++;
  for (const stars of STARS) {
    const expected = weights[stars] / 100;
    assert.ok(Math.abs(early[stars] / draws - expected) < 0.01, `${stars}-star before pity: ${early[stars] / draws}`);
  }

  // Halfway up the ramp the top tier is well above its base share, and the others split the rest
  // in the same proportions as before (50 : 30 : 10).
  const at80 = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (let i = 0; i < draws; i++) at80[rollStarsAtPull(80, weights, PITY)]++;
  const top = topChance(80, weights, PITY);
  assert.ok(Math.abs(at80[4] / draws - top) < 0.01, `top tier at 80: ${at80[4] / draws} vs ${top}`);
  const rest = 1 - top;
  assert.ok(Math.abs(at80[1] / draws - (rest * 50) / 90) < 0.01);
  assert.ok(Math.abs(at80[2] / draws - (rest * 30) / 90) < 0.01);
  assert.ok(Math.abs(at80[3] / draws - (rest * 10) / 90) < 0.01);
});

test('pity: nobody goes past the hard pity, and it averages about 60 pulls', () => {
  const runs = 5000;
  let total = 0;
  let longest = 0;
  for (let r = 0; r < runs; r++) {
    let pulls = 0;
    do pulls++;
    while (rollStarsAtPull(pulls, PITY_WEIGHTS, PITY) !== PITY_STARS);
    total += pulls;
    longest = Math.max(longest, pulls);
  }
  assert.ok(longest <= PITY.hardPity, `longest run was ${longest}`);
  const mean = total / runs;
  assert.ok(mean > 56 && mean < 65, `average pulls to a top-tier item was ${mean}`);
});

test('pity: the shipped defaults make 4-star a 0.6% pull with the pity described', () => {
  assert.equal(CONFIG.gacha.pity.softStart, 70);
  assert.equal(CONFIG.gacha.pity.hardPity, 90);
  const total = STARS.reduce((sum, stars) => sum + CONFIG.gacha.starWeights[stars], 0);
  assert.ok(Math.abs(CONFIG.gacha.starWeights[4] / total - 0.006) < 1e-9);
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
