import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULTS } from '../src/config.js';
import { REFINE, SLOT_EMOJI, TEXT, validateConstants } from '../src/constants/index.js';
import { ITEMS_BY_ID } from '../src/data/items.js';
import { describeEffects, equippedGear, gearEffects, totalEffects } from '../src/lib/game/items/equipment.js';
import { refineCopyPlan, refineCost, refineLevel, refinePlan, refineShare } from '../src/lib/game/items/refine.js';
import { findSpec } from '../src/lib/settings-spec.js';
import type { ItemDef } from '../src/types.js';

const item = (id: string) => ITEMS_BY_ID.get(id) as ItemDef;
const at = (ms: number) => new Date(ms);

test('refinement levels: R1 to R5, and copies from before refining (level 0) count as R1', () => {
  validateConstants();
  assert.equal(REFINE.maxLevel, 5);
  assert.equal(refineLevel(0), 1);
  assert.equal(refineLevel(1), 1);
  assert.equal(refineLevel(3), 3);
  assert.equal(refineLevel(5), 5);
  assert.equal(refineLevel(10), 5, 'never above the max (copies refined past it before it was lowered count as R5)');
});

test('refinement strength: equal steps up to exactly the listed value at R5, with a double step into R5', () => {
  const shares = Array.from({ length: 5 }, (_, i) => refineShare(i + 1));
  // 6 steps in all: 1, 2, 3, 4, then +2 to 6 (R5).
  assert.deepEqual(shares.map((s) => Math.round(s * 6)), [1, 2, 3, 4, 6]);
  assert.equal(refineShare(5), 1, 'R5 is exactly the value in the settings');
  assert.equal(refineShare(3), 0.5, 'R3 is exactly half');
  const steps = shares.map((s, i) => s - (shares[i - 1] ?? 0)).slice(1);
  for (const [i, step] of steps.entries()) {
    const level = i + 2;
    assert.ok(Math.abs(step - (level === 5 ? 2 / 6 : 1 / 6)) < 1e-12, `step into R${level}`);
  }
});

test('refinement shows as R and the level', () => {
  assert.equal(TEXT.gear.item('Wyrmscale Plate', '★★★', 3), '**Wyrmscale Plate** ★★★ · R3');
  assert.equal(TEXT.inventory.item('Wyrmscale Plate', 2, SLOT_EMOJI.armor, 3), `${SLOT_EMOJI.armor} Wyrmscale Plate ×2 · R3`);
  assert.equal(TEXT.inventory.item('Wyrmscale Plate', 2, SLOT_EMOJI.armor, 1), `${SLOT_EMOJI.armor} Wyrmscale Plate ×2`, 'R1 is left out of the inventory');
  assert.equal(TEXT.equip.effectsField(2), 'Effects (R2)');
  assert.match(TEXT.refine.done('<@a>', 2, 3, 1), /from \*\*R2\*\* to \*\*R3\*\*.*1 duplicate left/);
  assert.equal(TEXT.refine.maxed('Wyrmscale Plate', 5), 'Your **Wyrmscale Plate** is already fully refined (**R5**).');
  for (const text of [TEXT.refine.noDuplicate('X', 2), TEXT.refine.footer(5), TEXT.databank.description(5), TEXT.databank.description(1), TEXT.databank.detailEffectsField(5)]) {
    assert.doesNotMatch(text, /refinement \d/, text);
  }
});

test('gear counts at the worn copy\'s refinement; gear that does not say counts as fully refined', () => {
  const armor = item('wyrmscale-plate'); // 3-star guardBoost, 25% at refinement 10
  const full = DEFAULTS.equipment.guardBoost[3];
  assert.ok(Math.abs(gearEffects({ armor: armor.id, levels: { armor: 5 } }, 'u').guardBoost - full) < 1e-12);
  assert.ok(Math.abs(gearEffects({ armor: armor.id, levels: { armor: 3 } }, 'u').guardBoost - full / 2) < 1e-12);
  assert.ok(Math.abs(gearEffects({ armor: armor.id, levels: { armor: 1 } }, 'u').guardBoost - full / 6) < 1e-12);
  assert.ok(Math.abs(gearEffects({ armor: armor.id }, 'u').guardBoost - full) < 1e-12, 'no level given: full strength');
  assert.deepEqual(equippedGear({ armor: armor.id, levels: { armor: 3 } }), [{ item: armor, level: 3, bonus: true }]);
  // Bare items (the catalog describing itself) are fully refined too.
  assert.equal(totalEffects([armor]).guardBoost, full);
  assert.deepEqual(describeEffects(armor), ['Raid: Guard blocks 25% more of the hits you take']);
  assert.deepEqual(describeEffects(armor, 1, 3), ['Raid: Guard blocks 12.5% more of the hits you take']);
});

test('refine plan: raises the worn copy (or the best), uses up the lowest other copy, never a worn one', () => {
  const copy = (_id: string, level: number, obtained: number) => ({ _id, level, obtainedAt: at(obtained) });
  const worn = copy('worn', 3, 1);
  const spareLow = copy('low', 1, 5);
  const spareHigh = copy('high', 2, 2);

  const plan = refinePlan([spareHigh, worn, spareLow], new Set(['worn']));
  assert.ok(plan.ok);
  assert.equal(plan.target._id, 'worn');
  assert.equal(plan.fodder._id, 'low', 'the lowest-level spare is used up, so refining is not wasted');
  assert.deepEqual([plan.from, plan.to], [3, 4]);

  // Nothing worn: the best copy is raised.
  const unworn = refinePlan([spareLow, spareHigh], new Set());
  assert.ok(unworn.ok);
  assert.equal(unworn.target._id, 'high');
  assert.equal(unworn.fodder._id, 'low');

  // A legacy level-0 copy counts as 1.
  const legacy = refinePlan([copy('a', 0, 1), copy('b', 0, 2)], new Set());
  assert.ok(legacy.ok);
  assert.deepEqual([legacy.from, legacy.to], [1, 2]);

  assert.deepEqual(refinePlan([worn], new Set(['worn'])), { ok: false, reason: 'no_duplicate', level: 3, target: worn });
  assert.deepEqual(refinePlan([], new Set()), { ok: false, reason: 'not_owned', level: 0 });
  const max = copy('max', 5, 1);
  assert.deepEqual(refinePlan([max, spareLow], new Set()), { ok: false, reason: 'maxed', level: 5, target: max });
});

test('refine of a chosen copy: raises that copy whatever the others are at, using up the material picked', () => {
  const copy = (_id: string, level: number, obtained: number, masterwork = false) => ({ _id, level, obtainedAt: at(obtained), masterwork });
  const worn = copy('worn', 3, 1);
  const low = copy('low', 1, 5);
  const high = copy('high', 2, 2);
  const mw = copy('mw', 5, 3, true);
  const copies = [worn, low, high, mw];
  const kept = new Set(['worn']);

  // The R1 spare is raised, not the worn R3, using up the R2 picked.
  const picked = refineCopyPlan(copies, 'low', 'high', kept);
  assert.ok(picked.ok);
  assert.deepEqual([picked.target._id, picked.fodder._id, picked.from, picked.to], ['low', 'high', 1, 2]);

  // No material picked: the lowest-level one it could use.
  const auto = refineCopyPlan(copies, 'high', null, kept);
  assert.ok(auto.ok);
  assert.equal(auto.fodder._id, 'low');

  // Never a worn or kept copy, a masterwork, or the copy itself.
  for (const material of ['worn', 'mw', 'high', 'nope']) {
    assert.deepEqual(refineCopyPlan(copies, 'high', material, kept), { ok: false, reason: 'bad_material', level: 2, target: high }, material);
  }
  assert.deepEqual(refineCopyPlan([worn, mw], 'worn', null, kept), { ok: false, reason: 'no_duplicate', level: 3, target: worn });
  assert.deepEqual(refineCopyPlan(copies, 'gone', null, kept), { ok: false, reason: 'not_owned', level: 0 });
  const max = copy('max', 5, 1);
  assert.deepEqual(refineCopyPlan([max, low], 'max', 'low', kept), { ok: false, reason: 'maxed', level: 5, target: max });
});

test('refine cost: points by star tier and level, the lower tiers a share of the 4-star prices', () => {
  assert.deepEqual([2, 3, 4, 5].map((to) => refineCost(4, to)), [2_000, 3_000, 4_000, 6_000]);
  assert.deepEqual([2, 3, 4, 5].map((to) => refineCost(3, to)), [500, 750, 1_000, 1_500]);
  assert.deepEqual([2, 3, 4, 5].map((to) => refineCost(2, to)), [200, 300, 400, 600]);
  assert.deepEqual([2, 3, 4, 5].map((to) => refineCost(1, to)), [100, 150, 200, 300]);
  assert.equal(refineCost(4, 6), 0, 'no price past the top level');
  for (const stars of [1, 2, 3, 4]) for (const to of [2, 3, 4, 5]) assert.ok(findSpec(`refine.cost.${stars}.${to}`), `refine.cost.${stars}.${to} is a setting`);
});

test('refine cost: the messages say what it cost, and what it would cost when they can\'t pay', () => {
  assert.match(TEXT.refine.done('<@1>', 1, 2, 3, '2,000'), /R1.*R2.*duplicate and \*\*2,000\*\*/);
  assert.doesNotMatch(TEXT.refine.done('<@1>', 1, 2, 3, '0'), / and /, 'a free refine says nothing about points');
  assert.match(TEXT.refine.tooPoor('Piplup', 3, '3,000', '1,200'), /Piplup.*R3.*3,000.*1,200/);
  assert.equal(TEXT.refine.againButton(3, '3,000'), 'Refine to R3 (3,000)');
  assert.equal(TEXT.refine.againButton(3, '0'), 'Refine to R3');
});
