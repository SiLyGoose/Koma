import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gradientColor, rangeColors } from '../src/animations/images/palette.js';

const RED = [220, 70, 75];
const ORANGE = [235, 140, 60];
const GOLD = [245, 197, 66];

test('gradient: red at 0, orange in the middle, gold at 1, and it stays inside that range', () => {
  assert.deepEqual(gradientColor(0), RED);
  assert.deepEqual(gradientColor(0.5), ORANGE);
  assert.deepEqual(gradientColor(1), GOLD);
  assert.deepEqual(gradientColor(-3), RED);
  assert.deepEqual(gradientColor(7), GOLD);
});

test('gradient: whole color values, and the green channel only rises from red to gold', () => {
  let previous = -1;
  for (let step = 0; step <= 100; step++) {
    const color = gradientColor(step / 100);
    for (const channel of color) assert.ok(Number.isInteger(channel) && channel >= 0 && channel <= 255);
    assert.ok(color[1] >= previous, `green never falls (step ${step})`);
    previous = color[1];
  }
});

test('range: the biggest number is gold, the smallest is red, in any order', () => {
  const colors = rangeColors([29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29]);
  assert.deepEqual(colors[0], GOLD);
  assert.deepEqual(colors[8], GOLD);
  assert.deepEqual(colors[4], RED);
  const shuffled = rangeColors([0.2, 29, 1.5, 4, 0.3]);
  assert.deepEqual(shuffled[0], RED);
  assert.deepEqual(shuffled[1], GOLD);
});

test('range: a board that is the same on both sides is colored the same on both sides, with a gradient toward the middle', () => {
  const colors = rangeColors([29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29]);
  for (let i = 0; i < 4; i++) assert.deepEqual(colors[i], colors[8 - i], `slot ${i} matches its mirror`);
  // Each step in from the edge is no greener than the last one, and every step is a different color.
  for (let i = 1; i <= 4; i++) {
    assert.ok((colors[i] as number[])[1] <= (colors[i - 1] as number[])[1], `slot ${i} is not greener than slot ${i - 1}`);
    assert.notDeepEqual(colors[i], colors[i - 1]);
  }
});

test('range: the same numbers give the same colors whatever order they are in, and equal numbers give equal colors', () => {
  const values = [1, 0.1, 1.5, 0.4, 2.5, 0.75, 1.25, 0.5, 1];
  const colors = rangeColors(values);
  assert.deepEqual(colors[0], colors[8]);
  const reversed = rangeColors([...values].reverse()).reverse();
  assert.deepEqual(reversed, colors);
});

test('range: it is the range that decides, not the number: 1.4x is red on a board where nothing pays less', () => {
  assert.deepEqual(rangeColors([1.4, 29])[0], RED);
  assert.deepEqual(rangeColors([1.4, 1.5, 2])[2], GOLD);
  // Only the ratio matters, so scaling every number changes nothing.
  assert.deepEqual(rangeColors([1, 2, 8]), rangeColors([10, 20, 80]));
});

test('range: measured by ratio, so one huge number does not turn every other one red', () => {
  const colors = rangeColors([1000, 4, 1.5, 0.2]);
  // 4x is 20 times the smallest number, so it sits well above the bottom of the range rather than next to it.
  assert.ok((colors[1] as number[])[1] > (colors[3] as number[])[1] + 20, '4x is clearly not red');
  assert.ok((colors[1] as number[])[1] > (colors[2] as number[])[1], '4x is greener than 1.5x');
});

test('range: a 0 is the reddest and still different from the smallest number above it', () => {
  const colors = rangeColors([0, 0.5, 2, 9]);
  assert.deepEqual(colors[0], RED);
  assert.notDeepEqual(colors[1], RED);
  assert.deepEqual(colors[3], GOLD);
  // Negative numbers are treated as 0.
  assert.deepEqual(rangeColors([-1, 0.5, 2, 9]), colors);
});

test('range: when there is no range every number gets the middle color', () => {
  assert.deepEqual(rangeColors([3]), [ORANGE]);
  assert.deepEqual(rangeColors([2, 2, 2]), [ORANGE, ORANGE, ORANGE]);
  assert.deepEqual(rangeColors([0, 0]), [ORANGE, ORANGE]);
  assert.deepEqual(rangeColors([]), []);
});

test('range: it does not change the list it is given', () => {
  const values = [5, 1, 3];
  rangeColors(values);
  assert.deepEqual(values, [5, 1, 3]);
});

test('range: reversed flips the colors, so the biggest number is red and the smallest gold', () => {
  const values = [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29];
  const colors = rangeColors(values, { reversed: true });
  assert.deepEqual(colors[0], RED);
  assert.deepEqual(colors[8], RED);
  assert.deepEqual(colors[4], GOLD);
  // No slot keeps the color it had the other way round (none of them sits exactly in the middle of the range).
  const normal = rangeColors(values);
  for (let i = 0; i < values.length; i++) {
    assert.notDeepEqual(colors[i], normal[i], `slot ${i} differs unless it is the middle color`);
  }
  // Going in from the edge, the green channel now falls (red, orange, gold) instead of rising.
  for (let i = 1; i <= 4; i++) assert.ok((colors[i] as number[])[1] >= (colors[i - 1] as number[])[1], `slot ${i} is not redder than slot ${i - 1}`);
});

test('range: reversed keeps the special cases: 0 is at the bottom of the range (gold), no range is the middle color', () => {
  assert.deepEqual(rangeColors([0, 0.5, 2, 9], { reversed: true })[0], GOLD);
  assert.deepEqual(rangeColors([0, 0.5, 2, 9], { reversed: true })[3], RED);
  assert.deepEqual(rangeColors([2, 2], { reversed: true }), [ORANGE, ORANGE]);
  assert.deepEqual(rangeColors([], { reversed: true }), []);
  assert.deepEqual(rangeColors([1, 2, 8], { reversed: false }), rangeColors([1, 2, 8]));
});
