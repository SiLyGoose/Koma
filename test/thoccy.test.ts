import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ROB_STREAK_WINDOW_MS, TEXT } from '../src/constants/index.js';
import { ITEMS_BY_ID } from '../src/data/items.js';
import { MEMBERS } from '../src/data/members.js';
import { canUseItem, describeEffects, totalEffects } from '../src/lib/game/items/equipment.js';
import { streakRate } from '../src/perks/index.js';

const KEYBOARD = ITEMS_BY_ID.get('thoccy-keyboard')!;
const gearAt = (level: number) => totalEffects([{ item: KEYBOARD, level }]);
const round = (n: number): number => Math.round(n * 1e6) / 1e6;

test('thoccy: the Thoccy Keyboard is a 4-star unique treasure, only for its owner', () => {
  assert.deepEqual({ name: KEYBOARD.name, stars: KEYBOARD.stars, slot: KEYBOARD.slot }, { name: 'Thoccy Keyboard', stars: 4, slot: 'treasure' });
  assert.equal(MEMBERS.trina, '257061151542607872');
  assert.ok(canUseItem(KEYBOARD, '257061151542607872'));
  assert.ok(!canUseItem(KEYBOARD, '137980346393165824'));
  assert.equal(ROB_STREAK_WINDOW_MS, 6 * 60 * 60 * 1000);
});

test('thoccy: +10% a rob at every level, up to +30% at R1 and +50% at R5; vulnerable +20% at R1 down to +15% at R5', () => {
  for (const level of [1, 2, 3, 4, 5]) assert.equal(round(gearAt(level).robStreak), 0.1, `R${level} step`);
  assert.deepEqual([1, 2, 3, 4, 5].map((level) => round(gearAt(level).robStreakCap)), [0.3, 0.34, 0.38, 0.42, 0.5]);
  assert.deepEqual([1, 2, 3, 4, 5].map((level) => round(gearAt(level).robVulnerable)), [0.2, 0.19, 0.18, 0.17, 0.15]);
});

test('thoccy: the streak adds 10% for each successful rob in the window, up to the cap', () => {
  const r5 = gearAt(5);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 9].map((count) => round(streakRate(count, r5))), [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.5, 0.5]);
  const r1 = gearAt(1);
  assert.deepEqual([1, 2, 3, 4].map((count) => round(streakRate(count, r1))), [0.1, 0.2, 0.3, 0.3]);
  // Without the keyboard, no streak.
  assert.equal(streakRate(4, {}), 0);
});

test('thoccy: the gear card and the rob messages read right', () => {
  assert.deepEqual(describeEffects(KEYBOARD, 1, 5), [
    'Hackermans: +10% <:zeiucoin:1551675032424546320> for each successful rob in the last 6 hours',
    'Hackermans: the streak adds up to +50%',
    "Hackermans: fail a rob and you're vulnerable: the next rob against you takes +15%",
  ]);
  assert.match(TEXT.rob.streak(3, 6, '30%', '120'), /3 robs in 6 hours: \+30%.*120/);
  assert.match(TEXT.rob.streak(1, 6, '10%', '40'), /1 rob in 6 hours/);
  assert.match(TEXT.rob.vulnerableTaken('@alvin', '75'), /@alvin was vulnerable.*75/);
  assert.match(TEXT.rob.nowVulnerable('@thoccy', '15%'), /@thoccy is vulnerable.*\+15%/);
});
