import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reslotGear } from '../src/lib/game/items/reslot.js';
import type { Slot } from '../src/types.js';

/*
 * syncGearSlots' rules (services/migrate.ts), for an item whose catalog slot moved between weapon
 * and armor after members put it on.
 */

const slots: Record<string, Slot> = { robe: 'weapon', staff: 'weapon', plate: 'armor', ring: 'treasure' };
const slotOf = (id: string): Slot | undefined => slots[id];

test('reslotGear: gear already in the right place is left alone', () => {
  assert.equal(reslotGear({ weapon: 'staff', armor: 'plate' }, slotOf), null);
  assert.equal(reslotGear(null, slotOf), null);
  assert.equal(reslotGear({ weapon: null, armor: null }, slotOf), null);
  // A copy that is gone (or a treasure, syncTreasureSlot's job) is not this sync's to move.
  assert.equal(reslotGear({ weapon: 'sold', armor: 'ring' }, slotOf), null);
});

test('reslotGear: a copy in the wrong field moves into its own when that is free', () => {
  assert.deepEqual(reslotGear({ weapon: null, armor: 'robe' }, slotOf), { weapon: 'robe', armor: null, moved: 1, cleared: 0 });
  assert.deepEqual(reslotGear({ weapon: 'plate' }, slotOf), { weapon: null, armor: 'plate', moved: 1, cleared: 0 });
});

test('reslotGear: two copies each in the other one\'s field swap', () => {
  assert.deepEqual(reslotGear({ weapon: 'plate', armor: 'robe' }, slotOf), { weapon: 'robe', armor: 'plate', moved: 2, cleared: 0 });
});

test('reslotGear: a copy whose own field is taken comes off', () => {
  assert.deepEqual(reslotGear({ weapon: 'staff', armor: 'robe' }, slotOf), { weapon: 'staff', armor: null, moved: 0, cleared: 1 });
});
