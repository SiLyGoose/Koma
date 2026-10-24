import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TM_RECLAIMED, tmReclaimedChance, tmSalvageStones, tmStoneCost, tmStoneDrops, tmStoneName } from '../src/constants/technomagic.js';
import { ITEMS_BY_ID } from '../src/data/items.js';
import { isTmPiece, krMainValue, tmStoneClass } from '../src/data/kr-gear.js';
import { copyMainStat } from '../src/lib/game/heroes.js';
import { rollReclaimed, rollTmStones } from '../src/lib/game/technomagic.js';
import { refineState } from '../src/web/models/gear.js';
import { heroesView } from '../src/web/models/heroes.js';
import type { ItemDef, KrItem } from '../src/types.js';

const item = (id: string) => ITEMS_BY_ID.get(id) as ItemDef;
const ARMOR = 'perseverance-knight-armor';
const first = { index: () => 0 };
const last = { index: (max: number) => max - 1 };

test("TechnoMagic Raid: Upgrade Stones as King's Raid's: from stage 7, and what each star takes (half as many again Reclaimed)", () => {
  assert.deepEqual([1, 6, 7, 8, 9, 12].map(tmStoneDrops), [0, 0, 10, 15, 20, 20]);
  assert.deepEqual([1, 2, 3, 4, 5].map((to) => tmStoneCost(to)), [10, 20, 40, 80, 160]);
  assert.deepEqual([1, 2, 3, 4, 5].map((to) => tmStoneCost(to, true)), [15, 30, 60, 120, 240]);
  // (Salvaging one: King's Raid's EquipItemBreakTable, whatever its stars.)
  assert.equal(tmSalvageStones(), 1);
  assert.equal(tmSalvageStones(true), 2);
  assert.equal(tmStoneName('warrior'), 'Technomagic Gear Upgrade Stone (Warrior)');
});

test("TechnoMagic Raid: a win's stones are one class of the heroes brought (any class with none), none below stage 7", () => {
  assert.equal(rollTmStones(6, ['knight'], first), null);
  assert.deepEqual(rollTmStones(7, ['knight', 'priest'], first), { class: 'knight', count: 10 });
  assert.deepEqual(rollTmStones(9, ['knight', 'priest'], last), { class: 'priest', count: 20 });
  assert.deepEqual(rollTmStones(8, [], last), { class: 'archer', count: 15 });
});

test('TechnoMagic Raid: a piece is Reclaimed now and then, from stage 4', () => {
  assert.equal(tmReclaimedChance(3), 0);
  assert.equal(rollReclaimed(3, first), false);
  assert.equal(rollReclaimed(4, first), true);
  assert.equal(rollReclaimed(9, { index: () => Math.round(tmReclaimedChance(9) * 10_000) }), false, 'just past its chance');
});

test("TechnoMagic Raid: a Reclaimed piece's main stat is King's Raid's 31.25% higher", () => {
  const armor = item(ARMOR);
  assert.ok(isTmPiece(armor));
  assert.equal(tmStoneClass(armor), 'knight');
  assert.equal(tmStoneClass(item('iron-longsword')), null);
  const kr = armor.kr as KrItem;
  for (const stars of [0, 3, 5]) assert.equal(krMainValue(kr, stars, true), Math.floor(((kr.main?.[1] ?? 0) * [4300, 6235, 8600][[0, 3, 5].indexOf(stars)]!) / 1000 * TM_RECLAIMED.main));
  assert.ok((copyMainStat(armor, { level: 5, reclaimed: true })?.value ?? 0) > (copyMainStat(armor, { level: 5 })?.value ?? 0));
});

test("TechnoMagic Raid: a TechnoMagic piece is awakened with its class's stones, no spare copy, a Reclaimed one's dearer", () => {
  const armor = item(ARMOR);
  const one = [{ _id: 'a', itemId: ARMOR, level: 0, locked: false }];
  // No spare copy needed: just the stones and the price.
  assert.deepEqual(refineState('a', one, armor, new Set(), 10_000, { knight: 10 }), { blocked: null, cost: 2000, spare: null, stones: { class: 'knight', need: 10, have: 10 }, to: 1 });
  assert.equal(refineState('a', one, armor, new Set(), 10_000, { knight: 9 }).blocked, 'no_stones');
  assert.equal(refineState('a', one, armor, new Set(), 10_000, { priest: 500 }).blocked, 'no_stones', "another class's stones don't do");
  assert.equal(refineState('a', one, armor, new Set(), 0, { knight: 10 }).blocked, 'too_poor');
  assert.equal(refineState('a', one, armor, new Set(), 10_000, null).blocked, null, 'their stones not known: never held back');
  const reclaimed = [{ ...one[0]!, level: 3, reclaimed: true }];
  assert.deepEqual(refineState('a', reclaimed, armor, new Set(), 10_000, { knight: 120 }).stones, { class: 'knight', need: 120, have: 120 });
  assert.equal(refineState('a', [{ ...one[0]!, level: 5 }], armor, new Set(), 10_000, { knight: 999 }).blocked, 'maxed');
});

test("heroes page: a Reclaimed copy says so, its main stat higher, and their stones by class", () => {
  const view = heroesView(
    [
      { _id: 'r', itemId: ARMOR, level: 0, locked: false, reclaimed: true, tmSkill: undefined, tmPotentials: undefined },
      { _id: 'n', itemId: ARMOR, level: 0, locked: false, tmSkill: undefined, tmPotentials: undefined },
    ],
    { heroes: {}, points: 0, gems: 0, essences: {}, stones: { knight: 25 } },
  );
  const reclaimed = view.copies.find((copy) => copy.id === 'r');
  const plain = view.copies.find((copy) => copy.id === 'n');
  assert.equal(reclaimed?.name, `Reclaimed ${item(ARMOR).name}`);
  assert.equal(reclaimed?.reclaimed, true);
  assert.equal(plain?.reclaimed, undefined);
  assert.ok((reclaimed?.mainStat?.value ?? 0) > (plain?.mainStat?.value ?? 0));
  assert.deepEqual(reclaimed?.refine.stones, { class: 'knight', need: 15, have: 25 });
  assert.equal(view.stones?.knight, 25);
  assert.equal(view.stones?.wizard, 0);
});
