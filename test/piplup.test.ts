import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import { CURRENCY_EMOJI, TEXT } from '../src/constants/index.js';
import { EFFECTS, emptyTotals, slipChance, slipPenaltyAmount } from '../src/perks/index.js';
import { ITEMS_BY_ID } from '../src/data/items.js';
import { describeEffects } from '../src/lib/game/items/equipment.js';
import { findSpec, validateSettings } from '../src/lib/settings-spec.js';

const gear = (over: Partial<ReturnType<typeof emptyTotals>>) => ({ ...emptyTotals(), ...over });
const none = emptyTotals();
const close = (actual: number, expected: number, note = '') => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}${note ? ` (${note})` : ''}`);

test('slip chance: a Piplup on either side is enough, and one on both sides rolls twice', () => {
  close(slipChance(none, none), 0);
  close(slipChance(gear({ bubbleBeam: 0.1 }), none), 0.05); // the wearer robs: half as likely
  close(slipChance(none, gear({ bubbleBeam: 0.1 })), 0.1); // the wearer is robbed: in full
  close(slipChance(gear({ bubbleBeam: 0.1 }), gear({ bubbleBeam: 0.1 })), 1 - 0.95 * 0.9);
  close(slipChance(gear({ bubbleBeam: 0.2 }), none), 0.1, 'the 4-star default: 10% when robbing');
  close(slipChance(gear({ bubbleBeam: 2 }), gear({ bubbleBeam: -1 })), 0.5, 'held to 0..1, then halved for the robber');
  close(slipChance(none, gear({ bubbleBeam: 2 })), 1, 'held to 0..1');
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
  const lines = describeEffects(piplup, 1, 5, false);
  assert.equal(lines.length, 3, 'both perks, then the masterwork bonus it could have');
  assert.ok(lines.some((line) => /20%/.test(line)) && lines.some((line) => /25%/.test(line)));
  assert.match(lines[2]!, /^🔒 Masterwork/);
});

test('Piplup masterwork: its holder never slips when robbing, and a slip against them costs 50%', () => {
  const piplup = ITEMS_BY_ID.get('piplup')!;
  assert.deepEqual(piplup.bonus?.adds, ['slipGuard', 'bubbleBeamMasterPenalty']);
  assert.deepEqual(piplup.bonus?.removes, ['bubbleBeamPenalty']);
  assert.equal(CONFIG.equipment.bubbleBeamMasterPenalty[4], 0.5);
  assert.equal(CONFIG.equipment.slipGuard[4], 1);

  const masterwork = gear({ bubbleBeam: 0.2, slipGuard: 1, bubbleBeamMasterPenalty: 0.5 });
  const plain = gear({ bubbleBeam: 0.2, bubbleBeamPenalty: 0.25 });
  close(slipChance(masterwork, none), 0, 'robbing with it: never slips');
  close(slipChance(masterwork, plain), 0, "not even against someone else's Piplup");
  close(slipChance(gear({ slipGuard: 0.5 }), gear({ bubbleBeam: 0.2 })), 0.1, 'a weaker guard only halves it');
  close(slipChance(none, masterwork), 0.2, 'robbing its holder still slips as before');
  assert.equal(slipPenaltyAmount(200, none, masterwork), 100, '50% of what was taken');
  assert.equal(slipPenaltyAmount(200, plain, masterwork), 100, 'the bigger rate wins');

  const lines = describeEffects(piplup, 1, 5, true);
  assert.ok(lines.includes('Your own successful robs never slip'));
  assert.ok(lines.some((line) => /\+50%/.test(line)) && !lines.some((line) => /\+25%/.test(line)), 'the 50% penalty replaces the 25%');
  assert.match(lines.at(-1)!, /^✨ Masterwork: /);
});

test('slip reply: what went back, and the penalty only when there was one', () => {
  assert.equal(TEXT.rob.slipped('<@2>', '200', '20'), `<:piplupsmirk:1553135037120250046> ...but slipped! **200** ${CURRENCY_EMOJI} went back to <@2>, plus **20** ${CURRENCY_EMOJI} for the trouble.`);
  assert.equal(TEXT.rob.slipped('<@2>', '200', ''), `<:piplupsmirk:1553135037120250046> ...but slipped! **200** ${CURRENCY_EMOJI} went back to <@2>.`);
});
