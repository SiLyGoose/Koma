import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG, DEFAULTS, STARS, validateConfig } from '../src/config.js';
import {
  claimAmount,
  claimTaxAmount,
  claimTaxRate,
  EFFECT_IDS,
  EFFECTS,
  emptyTotals,
  pullCost,
  robFine,
  robStolenAmount,
  robSuccessChance,
  robTaxAmount,
  robTaxRate,
  type EffectId,
  type EffectTotals,
} from '../src/perks/index.js';
import { ITEMS, ITEMS_BY_ID, findItem, itemsByStars, validateItems } from '../src/data/items.js';
import { ADMIN_USER_ID, CURRENCY_EMOJI } from '../src/constants/index.js';
import { canUseItem, describeEffects, describeTotals, equippedItems, gearEffects, totalEffects, usableItems } from '../src/lib/game/equipment.js';
import { checkConstraints, findSpec, getPath, parseInput, validateSettings } from '../src/lib/settings-spec.js';
import type { ItemDef, Stars } from '../src/types.js';

const gear = (overrides: Partial<EffectTotals>): EffectTotals => ({ ...emptyTotals(), ...overrides });
const none = emptyTotals();
const limits = { minChance: 0.05, maxChance: 0.95 };
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test('catalog: every star tier has an item, and every item has effects', () => {
  validateItems();
  for (const stars of STARS) assert.ok(itemsByStars(stars).length > 0, `${stars}-star tier has no items`);
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
  // Pin the strengths this test reads, so it doesn't break when the default strengths are tuned.
  const pinned: [EffectId, Stars, number][] = [
    ['robChance', 3, 0.15],
    ['robAmount', 3, 0.3],
    ['fineReduction', 3, 0.75],
    ['glassCannon', 4, 0.5],
    ['glassCannonPenalty', 4, 2.5],
    ['robAmountCut', 4, 0.25],
    ['claimTax', 4, 0.25],
    ['robTax', 4, 0.25],
  ];
  const saved = pinned.map(([effect, stars]) => CONFIG.equipment[effect][stars]);
  for (const [effect, stars, value] of pinned) CONFIG.equipment[effect][stars] = value;
  try {
    effectsReadAsPlainText();
  } finally {
    pinned.forEach(([effect, stars], k) => {
      CONFIG.equipment[effect][stars] = saved[k] as number;
    });
  }
});

function effectsReadAsPlainText(): void {
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
    `+30% ${CURRENCY_EMOJI} stolen`,
    '-75% fine when caught',
  ]);
  assert.deepEqual(describeEffects({ ...blade, effects: ['glassCannon', 'glassCannonPenalty'], stars: 4 }), [
    `Glass cannon: +50% ${CURRENCY_EMOJI} stolen`,
    'Glass cannon: +250% fine when caught',
  ]);
  assert.deepEqual(describeEffects({ ...blade, effects: ['robAmountCut', 'claimTax'], stars: 4 }), [
    `-25% ${CURRENCY_EMOJI} stolen`,
    'Wither: members you rob lose 25% of their next claim to you',
  ]);
  assert.deepEqual(describeEffects({ ...blade, effects: ['robAmountCut', 'robTax'], stars: 4 }), [
    `-25% ${CURRENCY_EMOJI} stolen`,
    'Yowch, My Coins! You get 25% of the next rob by members you rob',
  ]);
  assert.deepEqual(describeTotals(emptyTotals()), []);
  assert.deepEqual(describeTotals(gear({ pullDiscount: 0.15 })), ['-15% gacha pull cost']);
}

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

test('glass cannon: the reward and the risk are separate multipliers that stack with the other rob effects, and show on the item', () => {
  const cannon = gear({ glassCannon: 0.5, glassCannonPenalty: 2.5 });
  assert.equal(robStolenAmount(200, cannon, none), 300);
  assert.equal(robFine(100, cannon), 350);

  // Each half works on its own, and neither touches the other's number.
  assert.equal(robStolenAmount(200, gear({ glassCannon: 0.5 }), none), 300);
  assert.equal(robFine(100, gear({ glassCannon: 0.5 })), 100);
  assert.equal(robStolenAmount(200, gear({ glassCannonPenalty: 2.5 }), none), 200);
  assert.equal(robFine(100, gear({ glassCannonPenalty: 2.5 })), 350);

  // Stacks with the other rob effects instead of replacing them.
  assert.equal(robStolenAmount(200, gear({ glassCannon: 0.5, robAmount: 0.4 }), none), 420);
  assert.equal(robStolenAmount(200, cannon, gear({ robShield: 0.5 })), 150);
  assert.equal(robFine(100, gear({ glassCannonPenalty: 2.5, fineReduction: 0.5 })), 175);
  assert.equal(robFine(100, gear({ glassCannonPenalty: 2.5, fineReduction: 1 })), 0);

  // Only the robber's gear counts: wearing it as the victim changes nothing.
  assert.equal(robStolenAmount(200, none, cannon), 200);

  // The 4-star numbers are balance settings (see perks/) that get retuned, so this does not pin them: the item just gets whatever they are.
  const c4: ItemDef = { id: 'test-c4', name: 'Test C4', stars: 4, slot: 'weapon', description: '', effects: ['glassCannon', 'glassCannonPenalty'] };
  const totals = totalEffects([c4]);
  assert.equal(totals.glassCannon, CONFIG.equipment.glassCannon[4]);
  assert.equal(totals.glassCannonPenalty, CONFIG.equipment.glassCannonPenalty[4]);
  for (const id of ['glassCannon', 'glassCannonPenalty']) {
    assert.equal(findSpec(`equipment.${id}.4`)?.group, 'Equipment');
  }
  assert.deepEqual(parseInput(findSpec('equipment.glassCannonPenalty.4')!, '250%'), { ok: true, value: 2.5 });
  assert.equal(parseInput(findSpec('equipment.glassCannon.4')!, '600%').ok, false);
});

test('robAmountCut (coughing baby, jew frog): a 25% cut leaves 75% of what the wearer steals', () => {
  assert.equal(robStolenAmount(200, gear({ robAmountCut: 0.25 }), none), 150);
  assert.equal(robStolenAmount(200, gear({ robAmountCut: 0.5 }), none), 100);
  assert.equal(robStolenAmount(200, gear({ robAmountCut: 0.5, robAmount: 0.5 }), none), 150);
  assert.equal(robStolenAmount(200, gear({ robAmountCut: 0.5, glassCannon: 0.5 }), none), 150);
  assert.equal(robStolenAmount(200, gear({ robAmountCut: 0.5 }), gear({ robShield: 0.5 })), 50);
  // Never below 1, and a cut over the cap is held to it like the other reductions.
  assert.equal(robStolenAmount(1, gear({ robAmountCut: 0.5 }), none), 1);
  assert.equal(robStolenAmount(100, gear({ robAmountCut: 5 }), none), 10);
  // It is the robber's own gear only: a victim wearing it loses nothing less.
  assert.equal(robStolenAmount(200, none, gear({ robAmountCut: 0.5 })), 200);
  // Doesn't touch the fine.
  assert.equal(robFine(100, gear({ robAmountCut: 0.5 })), 100);
});

test('coughing baby: the tax rate is held between 0 and 100%, and a tax never takes more than the claim', () => {
  assert.equal(claimTaxRate(none), 0);
  assert.equal(claimTaxRate(gear({ claimTax: 0.25 })), 0.25);
  assert.equal(claimTaxRate(gear({ claimTax: 3 })), 1);
  assert.equal(claimTaxRate(gear({ claimTax: -1 })), 0);

  assert.equal(claimTaxAmount(400, 0.25), 100);
  assert.equal(claimTaxAmount(333, 0.25), 83); // 83.25 rounds to 83
  assert.equal(claimTaxAmount(400, 0), 0);
  assert.equal(claimTaxAmount(400, 1), 400);
  assert.equal(claimTaxAmount(400, 2), 400);
  assert.equal(claimTaxAmount(0, 0.25), 0);
});

test('coughing baby: 4-star defaults are a 25% cut and a 25% claim tax, both normal settings', () => {
  assert.equal(CONFIG.equipment.robAmountCut[4], 0.25);
  assert.equal(CONFIG.equipment.claimTax[4], 0.25);
  for (const id of ['robAmountCut', 'claimTax']) {
    assert.equal(findSpec(`equipment.${id}.4`)?.group, 'Equipment');
  }
  assert.deepEqual(parseInput(findSpec('equipment.claimTax.4')!, '30%'), { ok: true, value: 0.3 });
  assert.equal(parseInput(findSpec('equipment.robAmountCut.4')!, '95%').ok, false, 'a cut of 90% or more is refused');
  assert.equal(parseInput(findSpec('equipment.claimTax.4')!, '101%').ok, false);
  const baby: ItemDef = { id: 'test-baby', name: 'Test Baby', stars: 4, slot: 'weapon', description: '', effects: ['robAmountCut', 'claimTax'] };
  const totals = totalEffects([baby]);
  assert.equal(totals.robAmountCut, 0.25);
  assert.equal(totals.claimTax, 0.25);
});

test('jew frog: the rob tax rate is held between 0 and 100%, and a tax never takes more than the rob', () => {
  assert.equal(robTaxRate(none), 0);
  assert.equal(robTaxRate(gear({ robTax: 0.25 })), 0.25);
  assert.equal(robTaxRate(gear({ robTax: 3 })), 1);
  assert.equal(robTaxRate(gear({ robTax: -1 })), 0);

  assert.equal(robTaxAmount(200, 0.25), 50);
  assert.equal(robTaxAmount(201, 0.25), 50); // 50.25 rounds to 50
  assert.equal(robTaxAmount(30, 0.5), 15);
  assert.equal(robTaxAmount(200, 0), 0);
  assert.equal(robTaxAmount(200, 1), 200);
  assert.equal(robTaxAmount(200, 2), 200);
});

test('jew frog: 4-star defaults are a 25% cut and a 25% rob tax, both normal settings', () => {
  assert.equal(CONFIG.equipment.robAmountCut[4], 0.25);
  assert.equal(CONFIG.equipment.robTax[4], 0.25);
  assert.equal(findSpec('equipment.robTax.4')?.group, 'Equipment');
  assert.deepEqual(parseInput(findSpec('equipment.robTax.4')!, '30%'), { ok: true, value: 0.3 });
  assert.equal(parseInput(findSpec('equipment.robTax.4')!, '101%').ok, false);

  const frog: ItemDef = { id: 'test-frog', name: 'Test Frog', stars: 4, slot: 'weapon', description: '', effects: ['robAmountCut', 'robTax'] };
  const totals = totalEffects([frog]);
  assert.equal(totals.robAmountCut, CONFIG.equipment.robAmountCut[4]);
  assert.equal(totals.robTax, CONFIG.equipment.robTax[4]);
  // Stealing from someone who wears nothing: 75% of the roll.
  assert.equal(robStolenAmount(200, totals, none), 150);
});

// ---------------------------------------------------------------------------
// Exclusive items (usableBy)

const ALVIN = '111111111111111111';
const HELEN = '222222222222222222';
const STRANGER = '333333333333333333';
const exclusiveBlade: ItemDef = {
  id: 'test-exclusive-blade',
  name: 'Exclusive Blade',
  stars: 4,
  slot: 'weapon',
  description: '',
  effects: ['robChance', 'robAmount'],
  usableBy: [ALVIN, HELEN],
};
const openBlade: ItemDef = { ...exclusiveBlade, id: 'test-open-blade', name: 'Open Blade', usableBy: undefined };

test('exclusive items: only the listed members and the admin can use one, and no list means everyone', () => {
  assert.equal(canUseItem(exclusiveBlade, ALVIN), true);
  assert.equal(canUseItem(exclusiveBlade, HELEN), true);
  assert.equal(canUseItem(exclusiveBlade, STRANGER), false);
  assert.equal(canUseItem(exclusiveBlade, ADMIN_USER_ID), true, 'the admin can test everything');
  assert.equal(canUseItem(openBlade, STRANGER), true);
  assert.deepEqual(usableItems([exclusiveBlade, openBlade], STRANGER).map((item) => item.id), ['test-open-blade']);
  assert.deepEqual(usableItems([exclusiveBlade, openBlade], ALVIN).map((item) => item.id), ['test-exclusive-blade', 'test-open-blade']);
});

test('exclusive items: an equipped one adds effects only for members it is for', () => {
  ITEMS_BY_ID.set(exclusiveBlade.id, exclusiveBlade);
  try {
    const equipment = { weapon: exclusiveBlade.id };
    assert.equal(gearEffects(equipment, ALVIN).robChance, CONFIG.equipment.robChance[4]);
    assert.equal(gearEffects(equipment, ALVIN).robAmount, CONFIG.equipment.robAmount[4]);
    assert.deepEqual(gearEffects(equipment, STRANGER), emptyTotals());
    assert.equal(gearEffects(equipment, ADMIN_USER_ID).robChance, CONFIG.equipment.robChance[4]);
    // Still equipped for the stranger: the slot is not emptied, it just gives nothing.
    assert.equal(equippedItems(equipment).length, 1);
  } finally {
    ITEMS_BY_ID.delete(exclusiveBlade.id);
  }
});

test('exclusive items: the catalog check refuses an empty list or something that is not a user id', () => {
  const catalog = ITEMS as ItemDef[];
  const check = (usableBy: readonly string[] | undefined) => {
    const test: ItemDef = { ...exclusiveBlade, id: 'test-check', name: 'Check Blade', usableBy };
    catalog.push(test);
    try {
      validateItems();
    } finally {
      catalog.pop();
    }
  };
  check([ALVIN]);
  check(undefined);
  assert.throws(() => check([]), /empty usableBy/);
  assert.throws(() => check(['alvin']), /not a Discord user id/);
  assert.throws(() => check([ALVIN, '12345']), /not a Discord user id/);
  validateItems();
});
