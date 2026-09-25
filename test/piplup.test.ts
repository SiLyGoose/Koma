import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import { CURRENCY_EMOJI, TEXT } from '../src/constants/index.js';
import { EFFECTS, emptyTotals, slipChance, slipPenaltyAmount } from '../src/perks/index.js';
import { ITEMS_BY_ID } from '../src/data/items.js';
import { describeEffects } from '../src/lib/game/equipment.js';
import { findSpec, validateSettings } from '../src/lib/settings-spec.js';

const gear = (over: Partial<ReturnType<typeof emptyTotals>>) => ({ ...emptyTotals(), ...over });
const none = emptyTotals();
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test('slip chance: a Piplup on either side is enough, and one on both sides rolls twice', () => {
  close(slipChance(none, none), 0);
  close(slipChance(gear({ bubbleBeam: 0.1 }), none), 0.1); // the wearer robs
  close(slipChance(none, gear({ bubbleBeam: 0.1 })), 0.1); // the wearer is robbed
  close(slipChance(gear({ bubbleBeam: 0.1 }), gear({ bubbleBeam: 0.1 })), 0.19);
  close(slipChance(gear({ bubbleBeam: 2 }), gear({ bubbleBeam: -1 })), 1, 'held to 0..1');
});

test('slip penalty: a share of what was taken, from either side, rounded', () => {
  assert.equal(slipPenaltyAmount(200, gear({ bubbleBeamPenalty: 0.1 }), none), 20);
  assert.equal(slipPenaltyAmount(200, none, gear({ bubbleBeamPenalty: 0.1 })), 20);
  assert.equal(slipPenaltyAmount(155, none, gear({ bubbleBeamPenalty: 0.1 })), 16);
  assert.equal(slipPenaltyAmount(200, gear({ bubbleBeamPenalty: 0.1 }), gear({ bubbleBeamPenalty: 0.25 })), 50, 'the bigger one, not both');
  assert.equal(slipPenaltyAmount(200, none, none), 0);
  assert.equal(slipPenaltyAmount(0, gear({ bubbleBeamPenalty: 0.1 }), none), 0);
});

test('Bubble Beam effects: per-star settings, 4 stars a 20% chance and a 25% penalty', () => {
  assert.equal(CONFIG.equipment.bubbleBeam[4], 0.2);
  assert.equal(CONFIG.equipment.bubbleBeamPenalty[4], 0.25);
  assert.ok(findSpec('equipment.bubbleBeam.4'));
  assert.ok(findSpec('equipment.bubbleBeamPenalty.4'));
  assert.deepEqual(validateSettings(CONFIG), []);
  assert.match(EFFECTS.bubbleBeam.text('10%'), /10%/);
  assert.match(EFFECTS.bubbleBeamPenalty.text('10%'), /10%/);
});

test('Piplup: wears both Bubble Beam effects and lists them with their strengths', () => {
  const piplup = ITEMS_BY_ID.get('piplup');
  assert.ok(piplup, 'the catalog has Piplup');
  assert.equal(piplup.slot, 'treasure');
  assert.deepEqual([...piplup.effects].sort(), ['bubbleBeam', 'bubbleBeamPenalty']);
  const lines = describeEffects(piplup);
  assert.equal(lines.length, 2);
  assert.ok(lines.some((line) => /20%/.test(line)) && lines.some((line) => /25%/.test(line)));
});

test('slip reply: what went back, and the penalty only when there was one', () => {
  assert.equal(TEXT.rob.slipped('<@2>', '200', '20'), `🐧 ...and slipped! **200** ${CURRENCY_EMOJI} went back to <@2>, plus **20** ${CURRENCY_EMOJI} for the trouble.`);
  assert.equal(TEXT.rob.slipped('<@2>', '200', ''), `🐧 ...and slipped! **200** ${CURRENCY_EMOJI} went back to <@2>.`);
});
