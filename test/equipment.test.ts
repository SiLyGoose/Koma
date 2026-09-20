import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG, DEFAULTS, STARS, validateConfig } from '../src/config.js';
import { EFFECT_IDS, EFFECTS, emptyTotals, type EffectTotals } from '../src/data/effects.js';
import { ITEMS, ITEMS_BY_ID, findItem, itemsByStars, validateItems } from '../src/data/items.js';
import { describeEffects, describeTotals, equippedItems, totalEffects } from '../src/lib/equipment.js';
import { claimAmount, pullCost, robFine, robStolenAmount, robSuccessChance } from '../src/lib/perks.js';
import { checkConstraints, findSpec, getPath, parseInput, validateSettings } from '../src/lib/settings-spec.js';
import type { ItemDef } from '../src/types.js';

const gear = (overrides: Partial<EffectTotals>): EffectTotals => ({ ...emptyTotals(), ...overrides });
const none = emptyTotals();
const limits = { minChance: 0.05, maxChance: 0.95 };
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test('catalog: every star tier has a weapon and an armor, and every item has effects', () => {
  validateItems();
  for (const stars of STARS) {
    const slots = new Set(itemsByStars(stars).map((item) => item.slot));
    assert.ok(slots.has('weapon'), `${stars}-star tier has no weapon`);
    assert.ok(slots.has('armor'), `${stars}-star tier has no armor`);
  }
  for (const item of ITEMS) assert.ok(item.effects.length > 0, `${item.id} has no effects`);
});

test('catalog: every effect is used by at least one item', () => {
  const used = new Set(ITEMS.flatMap((item) => item.effects));
  for (const id of EFFECT_IDS) assert.ok(used.has(id), `${id} is not on any item`);
});

test('every effect has a default and a setting for every star tier', () => {
  assert.deepEqual(validateSettings(structuredClone(DEFAULTS)), []);
  for (const id of EFFECT_IDS) {
    for (const stars of STARS) {
      const key = `equipment.${id}.${stars}`;
      assert.ok(findSpec(key), `missing spec ${key}`);
      assert.equal(getPath(DEFAULTS, key), EFFECTS[id].defaults[stars]);
    }
  }
});

test('higher star tiers are never weaker by default', () => {
  for (const id of EFFECT_IDS) {
    const values = STARS.map((stars) => EFFECTS[id].defaults[stars]);
    for (let i = 1; i < values.length; i++) {
      assert.ok((values[i - 1] as number) <= (values[i] as number), `${id} gets weaker at ${STARS[i]} stars`);
    }
  }
});

test('effect settings accept percentages and enforce each effect limits', () => {
  const chance = findSpec('equipment.robChance.2');
  assert.ok(chance);
  assert.deepEqual(parseInput(chance, '12%'), { ok: true, value: 0.12 });
  assert.equal(parseInput(chance, '150%').ok, false);
  assert.equal(parseInput(chance, '-1%').ok, false);

  const shield = findSpec('equipment.robShield.3');
  assert.ok(shield);
  assert.equal(parseInput(shield, '95%').ok, false, 'a shield cannot reach 100%');
  assert.equal(parseInput(shield, '90%').ok, true);
});

test('rob.minChance cannot be above rob.maxChance', () => {
  const bad = structuredClone(CONFIG);
  bad.rob.minChance = 0.9;
  bad.rob.maxChance = 0.1;
  assert.match(checkConstraints(bad) ?? '', /minChance/);
  assert.equal(checkConstraints(structuredClone(CONFIG)), null);
  validateConfig();
});

// ---------------------------------------------------------------------------

test('findItem: exact, punctuation-insensitive, partial and ambiguous names', () => {
  const found = (query: string) => {
    const result = findItem(query);
    assert.equal(result.kind, 'found', `"${query}" should be found`);
    return result.kind === 'found' ? result.item.id : '';
  };
  assert.equal(found('Iron Longsword'), 'iron-longsword');
  assert.equal(found('iron longsword'), 'iron-longsword');
  assert.equal(found("merchant's coat"), 'merchants-coat');
  assert.equal(found('merchants coat'), 'merchants-coat');
  assert.equal(found('starfall-blade'), 'starfall-blade');
  assert.equal(found('dagger'), 'rusty-dagger');

  assert.equal(findItem('nothing like it').kind, 'none');
  assert.equal(findItem('   ').kind, 'none');

  const ambiguous = findItem('s');
  assert.equal(ambiguous.kind, 'ambiguous');
  if (ambiguous.kind === 'ambiguous') assert.ok(ambiguous.matches.length > 1);
});

test('findItem only searches the pool it is given', () => {
  const pool = [ITEMS_BY_ID.get('rusty-dagger')!];
  assert.equal(findItem('dagger', pool).kind, 'found');
  assert.equal(findItem('longsword', pool).kind, 'none');
});

test('equippedItems ignores empty, unknown and wrong-slot ids', () => {
  assert.deepEqual(equippedItems(undefined), []);
  assert.deepEqual(equippedItems({}), []);
  assert.deepEqual(equippedItems({ weapon: null, armor: null }), []);
  assert.deepEqual(equippedItems({ weapon: 'removed-item', armor: 'nope' }), []);
  // A weapon in the armor slot (e.g. after the catalog changed) is not trusted.
  assert.deepEqual(equippedItems({ armor: 'rusty-dagger' }), []);

  const both = equippedItems({ weapon: 'iron-longsword', armor: 'wooden-shield' });
  assert.deepEqual(both.map((item) => item.id), ['iron-longsword', 'wooden-shield']);
});

test('totalEffects adds up every equipped item using the live settings', () => {
  const sword = ITEMS_BY_ID.get('iron-longsword')!; // 2 star: robChance, robAmount
  const shield = ITEMS_BY_ID.get('wooden-shield')!; // 1 star: robDefense
  const totals = totalEffects([sword, shield]);
  assert.equal(totals.robChance, CONFIG.equipment.robChance[2]);
  assert.equal(totals.robAmount, CONFIG.equipment.robAmount[2]);
  assert.equal(totals.robDefense, CONFIG.equipment.robDefense[1]);
  assert.equal(totals.claimBonus, 0);
  assert.deepEqual(totalEffects([]), emptyTotals());

  // Changing a setting changes the strength right away.
  const before = CONFIG.equipment.robChance[2];
  CONFIG.equipment.robChance[2] = 0.33;
  try {
    assert.equal(totalEffects([sword]).robChance, 0.33);
  } finally {
    CONFIG.equipment.robChance[2] = before;
  }
});

test('effects read as plain text', () => {
  // A made-up item, so this test doesn't break when the real catalog is edited.
  const blade: ItemDef = {
    id: 'test-blade',
    name: 'Test Blade',
    stars: 3,
    slot: 'weapon',
    description: '',
    effects: ['robChance', 'robAmount', 'fineReduction'],
  };
  assert.deepEqual(describeEffects(blade), [
    '+15% rob success chance',
    '+30% points stolen',
    '-75% fine when caught',
  ]);
  assert.deepEqual(describeTotals(emptyTotals()), []);
  assert.deepEqual(describeTotals(gear({ pullDiscount: 0.15 })), ['-15% gacha pull cost']);
});

// ---------------------------------------------------------------------------

test('perks change nothing when nothing is equipped', () => {
  assert.equal(robSuccessChance(0.4, limits, none, none), 0.4);
  assert.equal(robStolenAmount(250, none, none), 250);
  assert.equal(robFine(100, none), 100);
  assert.equal(claimAmount(300, none), 300);
  assert.equal(pullCost(280, none), 280);
});

test('rob chance: offense adds, defense subtracts, both cancel', () => {
  close(robSuccessChance(0.4, limits, gear({ robChance: 0.15 }), none), 0.55);
  close(robSuccessChance(0.4, limits, none, gear({ robDefense: 0.1 })), 0.3);
  close(robSuccessChance(0.4, limits, gear({ robChance: 0.15 }), gear({ robDefense: 0.15 })), 0.4);
});

test('rob chance: gear is held to the min and max, but the base chance is respected', () => {
  assert.equal(robSuccessChance(0.9, limits, gear({ robChance: 0.5 }), none), 0.95);
  assert.equal(robSuccessChance(0.1, limits, none, gear({ robDefense: 0.5 })), 0.05);
  // A base chance outside the limits is not forced back inside by having gear.
  assert.equal(robSuccessChance(0.99, limits, gear({ robChance: 0.05 }), none), 0.99);
  assert.equal(robSuccessChance(0.02, limits, none, gear({ robDefense: 0.05 })), 0.02);
  // ...but gear can still move it in the other direction.
  close(robSuccessChance(0.99, limits, none, gear({ robDefense: 0.2 })), 0.79);
});

test('stolen amount: boosted by the robber, cut by the victim, never below 1', () => {
  assert.equal(robStolenAmount(200, gear({ robAmount: 0.3 }), none), 260);
  assert.equal(robStolenAmount(200, none, gear({ robShield: 0.2 })), 160);
  assert.equal(robStolenAmount(200, gear({ robAmount: 0.5 }), gear({ robShield: 0.5 })), 150);
  assert.equal(robStolenAmount(1, none, gear({ robShield: 0.9 })), 1);
  // Even absurd shield stacking is capped at 90%.
  assert.equal(robStolenAmount(100, none, gear({ robShield: 3 })), 10);
});

test('fine, claim and pull perks', () => {
  assert.equal(robFine(100, gear({ fineReduction: 0.5 })), 50);
  assert.equal(robFine(100, gear({ fineReduction: 1 })), 0);
  assert.equal(robFine(100, gear({ fineReduction: 2 })), 0);
  assert.equal(claimAmount(300, gear({ claimBonus: 0.1 })), 330);
  assert.equal(pullCost(280, gear({ pullDiscount: 0.1 })), 252);
  assert.equal(pullCost(280, gear({ pullDiscount: 5 })), 28);
  assert.equal(pullCost(1, gear({ pullDiscount: 0.9 })), 1);
});
