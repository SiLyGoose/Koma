import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ITEMS_BY_ID, TM_DROPS } from '../src/data/items.js';
import { migratedCopy, migratedEquipment, migratedItemId, migratedOptions } from '../src/services/kr-migrate.js';

test("kr migrate: every old TechnoMagic piece becomes its class's Perseverance piece: a weapon its Orb, an armor its Armor or Mantle, a treasure its Earrings", () => {
  for (const old of TM_DROPS) {
    const to = migratedItemId(old.id, 'physical');
    assert.ok(to && ITEMS_BY_ID.get(to)?.kr, old.id);
    assert.ok(ITEMS_BY_ID.get(to)?.kr?.classes.includes(old.class!), old.id);
  }
  assert.equal(migratedItemId('tri-head-cleaver'), 'perseverance-warrior-orb');
  assert.equal(migratedItemId('bogmist-robe', 'physical'), 'perseverance-wizard-armor');
  assert.equal(migratedItemId('bogmist-robe', 'magical'), 'perseverance-wizard-secondary');
  assert.equal(migratedItemId('galgorias-heart'), 'perseverance-warrior-earrings');
  assert.equal(migratedItemId('worldbreaker-maul'), null, "the members' own gear stays as it is");
});

test('kr migrate: a copy keeps its strength: R5 (its main stat was 5★), its potentials its two options (the best first, at their steps), the rest rolled', () => {
  const copy = migratedCopy({ itemId: 'tri-head-cleaver', tmPotentials: [{ stat: 'tough', value: 0.1 }, { stat: 'atk', value: 0.12 }, { stat: 'crit', value: 0.05 }, { stat: 'defense', value: 0.08 }] });
  assert.equal(copy?.itemId, 'perseverance-warrior-orb');
  assert.equal(copy?.level, 5);
  // ATK at the top of its old range: the top step; DEF (P.DEF) half-way: the middle one; Tough isn't in the pool.
  assert.deepEqual(copy?.options, [
    { stat: 'atk', step: 2 },
    { stat: 'defPhysical', step: 1 },
  ]);
  // None of the pool's: both rolled, as a new copy's are (the same stat twice or not).
  const rolled = migratedOptions('perseverance-warrior-orb', [{ stat: 'tough', value: 0.1 }]);
  assert.equal(rolled.length, 2);
  // One of the pool's: it, and one rolled, which may be the same stat.
  const one = migratedOptions('perseverance-warrior-orb', [{ stat: 'atk', value: 0.12 }], { index: () => 0 });
  assert.equal(one.length, 2);
  assert.deepEqual(one[0], { stat: 'atk', step: 2 });
  assert.equal(migratedCopy({ itemId: 'the-guardian-exian' }), null);
});

test("kr migrate: a hero's slots become King's Raid's; the members' own gear and a second piece for a filled slot come off", () => {
  const items: Record<string, string> = {
    uw: 'the-guardian-exian',
    w2: 'perseverance-warrior-orb', // its TechnoMagic weapon, moved
    a1: 'perseverance-warrior-armor',
    a2: 'perseverance-warrior-secondary',
    t: 'perseverance-warrior-earrings', // its TechnoMagic treasure, moved
    maul: 'worldbreaker-maul',
  };
  const now = migratedEquipment({ weapon1: 'uw', weapon2: 'w2', armor1: 'a1', armor2: 'a2', treasure: 't' }, (id) => items[id]);
  assert.deepEqual(now, { weapon: 'uw', orb: 'w2', armor: 'a1', secondary: 'a2', accessory: 't' });
  // Two TechnoMagic weapons: one Orb worn, the other off. The raid's gear off.
  const two = migratedEquipment({ weapon1: 'w2', weapon2: 'w3', armor1: 'maul' }, (id) => (id === 'w3' ? 'perseverance-warrior-orb' : items[id]));
  assert.deepEqual(two, { orb: 'w2' });
  // A unique treasure and its subs stay; a copy no longer theirs is gone.
  const ut = migratedEquipment({ treasure: 'ut', side1: 's1', armor1: 'gone' }, (id) => (id === 'ut' ? 'kirze-ut-1' : id === 's1' ? 'kirze-ut-2' : undefined));
  assert.equal(ut.armor, undefined);
  // Already moved: as it is.
  assert.deepEqual(migratedEquipment({ weapon: 'uw', orb: 'w2' }, (id) => items[id]), { weapon: 'uw', orb: 'w2' });
});
