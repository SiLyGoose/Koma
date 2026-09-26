import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULTS } from '../src/config.js';
import { REFINE, SLOT_EMOJI, TEXT, validateConstants } from '../src/constants/index.js';
import { ITEMS_BY_ID } from '../src/data/items.js';
import { describeEffects, equippedGear, gearEffects, totalEffects } from '../src/lib/game/equipment.js';
import { refineLevel, refinePlan, refineShare } from '../src/lib/game/refine.js';
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
  assert.deepEqual(equippedGear({ armor: armor.id, levels: { armor: 3 } }), [{ item: armor, level: 3 }]);
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

  assert.deepEqual(refinePlan([worn], new Set(['worn'])), { ok: false, reason: 'no_duplicate', level: 3 });
  assert.deepEqual(refinePlan([], new Set()), { ok: false, reason: 'not_owned', level: 0 });
  assert.deepEqual(refinePlan([copy('max', 5, 1), spareLow], new Set()), { ok: false, reason: 'maxed', level: 5 });
});
