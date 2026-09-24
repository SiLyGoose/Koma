import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import { claimAmount, EFFECTS, emptyTotals, robStolenAmount, robSuccessChance } from '../src/perks/index.js';
import { ITEMS_BY_ID } from '../src/data/items.js';
import { describeEffects } from '../src/lib/game/equipment.js';
import { findSpec, validateSettings } from '../src/lib/settings-spec.js';

const gear = (over: Partial<ReturnType<typeof emptyTotals>>) => ({ ...emptyTotals(), ...over });
const none = emptyTotals();
const limits = { minChance: 0.05, maxChance: 0.95 };
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test('smart: more from claims and robs, stacking with claimBonus and robAmount', () => {
  assert.equal(claimAmount(100, gear({ smart: 0.75 })), 175);
  assert.equal(claimAmount(100, gear({ smart: 0.75, claimBonus: 0.2 })), 210);
  assert.equal(robStolenAmount(200, gear({ smart: 0.75 }), none), 350);
  assert.equal(robStolenAmount(200, gear({ smart: 0.75, robAmount: 0.2 }), none), 420);
  // Only the wearer's own claims and robs: being robbed while wearing it changes nothing.
  assert.equal(robStolenAmount(200, none, gear({ smart: 0.75 })), 200);
});

test('ICONIC BY MISTAKE: added to a robber\'s chance against the wearer, offsetting defense', () => {
  close(robSuccessChance(0.5, limits, none, gear({ iconicByMistake: 0.15 })), 0.65);
  close(robSuccessChance(0.5, limits, none, gear({ iconicByMistake: 0.15, robDefense: 0.1 })), 0.55);
  close(robSuccessChance(0.9, limits, none, gear({ iconicByMistake: 0.15 })), 0.95); // held to the maximum chance
  // The wearer's own robbing is not affected.
  close(robSuccessChance(0.5, limits, gear({ iconicByMistake: 0.15 }), none), 0.5);
});

test('Chaewon effects: per-star settings, 4 stars giving +75% and +15%', () => {
  assert.equal(CONFIG.equipment.smart[4], 0.75);
  assert.equal(CONFIG.equipment.iconicByMistake[4], 0.15);
  assert.ok(findSpec('equipment.smart.4'));
  assert.ok(findSpec('equipment.iconicByMistake.4'));
  assert.deepEqual(validateSettings(CONFIG), []);
  assert.match(EFFECTS.smart.text('75%'), /75%/);
  assert.match(EFFECTS.iconicByMistake.text('15%'), /15%/);
});

test('Chaewon Photocard: wears both effects and lists them with their strengths', () => {
  const card = ITEMS_BY_ID.get('chaewon-photocard');
  assert.ok(card, 'the catalog has the photocard');
  assert.deepEqual([...card.effects].sort(), ['iconicByMistake', 'smart']);
  const lines = describeEffects(card);
  assert.equal(lines.length, 2);
  assert.ok(lines.some((line) => /Smart/.test(line) && /75%/.test(line)));
  assert.ok(lines.some((line) => /ICONIC BY MISTAKE/.test(line) && /15%/.test(line) && /robbed/.test(line)));
});
