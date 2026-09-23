import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import { EFFECT_TEXT } from '../src/constants.js';
import { EFFECTS, emptyTotals } from '../src/data/effects.js';
import { ITEMS_BY_ID } from '../src/data/items.js';
import { describeEffects } from '../src/lib/game/equipment.js';
import { claimGapHours, robCooldownScale, robSuccessChance } from '../src/lib/game/perks.js';
import { findSpec, validateSettings } from '../src/lib/settings-spec.js';

const gear = (over: Partial<ReturnType<typeof emptyTotals>>) => ({ ...emptyTotals(), ...over });
const limits = { minChance: 0.05, maxChance: 0.95 };
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test('sloth defense: taken off a robber\'s chance against the wearer, on top of robDefense', () => {
  close(robSuccessChance(0.6, limits, emptyTotals(), gear({ slothDefense: 0.4 })), 0.2);
  close(robSuccessChance(0.6, limits, emptyTotals(), gear({ slothDefense: 0.4, robDefense: 0.1 })), 0.1);
  close(robSuccessChance(0.6, limits, gear({ robChance: 0.2 }), gear({ slothDefense: 0.4 })), 0.4);
  close(robSuccessChance(0.4, limits, emptyTotals(), gear({ slothDefense: 0.4 })), 0.05); // held to the minimum chance
  close(robSuccessChance(0.4, limits, emptyTotals(), emptyTotals()), 0.4); // nothing worn changes nothing
  // The wearer's own robbing is not affected.
  close(robSuccessChance(0.4, limits, gear({ slothDefense: 0.4 }), emptyTotals()), 0.4);
});

test('sloth cooldown: the rob cooldown is stretched exactly', () => {
  assert.equal(robCooldownScale(emptyTotals()), 1);
  assert.equal(robCooldownScale(gear({ slothCooldown: 1 })), 2);
  assert.equal(robCooldownScale(gear({ slothCooldown: 0.5 })), 1.5);
  assert.equal(robCooldownScale(gear({ slothCooldown: -1 })), 1, 'never shorter than normal');
});

test('sloth cooldown: the claim wait is counted in whole clock hours, never below one', () => {
  assert.equal(claimGapHours(emptyTotals()), 1);
  assert.equal(claimGapHours(gear({ slothCooldown: 1 })), 2);
  assert.equal(claimGapHours(gear({ slothCooldown: 0.25 })), 1);
  assert.equal(claimGapHours(gear({ slothCooldown: 0.5 })), 2);
  assert.equal(claimGapHours(gear({ slothCooldown: 2 })), 3);
  assert.equal(claimGapHours(gear({ slothCooldown: -5 })), 1);
});

test('sloth effects: normal per-star settings, 4 stars doubling the cooldowns and taking 40% off the robber', () => {
  assert.deepEqual(EFFECTS.slothDefense.defaults, { 1: 0.1, 2: 0.2, 3: 0.3, 4: 0.4 });
  assert.deepEqual(EFFECTS.slothCooldown.defaults, { 1: 0.25, 2: 0.5, 3: 0.75, 4: 1 });
  assert.equal(CONFIG.equipment.slothDefense[4], 0.4);
  assert.equal(CONFIG.equipment.slothCooldown[4], 1);
  assert.ok(findSpec('equipment.slothDefense.4'));
  assert.ok(findSpec('equipment.slothCooldown.4'));
  assert.deepEqual(validateSettings(CONFIG), []);
  assert.match(EFFECT_TEXT.slothDefense('40%'), /40%/);
  assert.match(EFFECT_TEXT.slothCooldown('100%'), /100%/);
});

test('Sid the Sloth: wears the two sloth effects and lists them with their strengths', () => {
  const sid = ITEMS_BY_ID.get('sid-the-sloth');
  assert.ok(sid, 'the catalog has Sid');
  assert.equal(sid.slot, 'treasure'); // Sid became a unique treasure along with the other 4-star items.
  assert.deepEqual([...sid.effects].sort(), ['slothCooldown', 'slothDefense']);
  const lines = describeEffects(sid);
  assert.equal(lines.length, 2);
  assert.ok(lines.some((line) => /40%/.test(line) && /robbed/.test(line)));
  assert.ok(lines.some((line) => /100%/.test(line) && /cooldown/.test(line)));
});
