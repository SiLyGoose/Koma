import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TM_CRYSTALS, TM_RECLAIMED, tmCrystalDrops, tmCrystalName, tmReclaimedChance, tmSalvageCrystals, tmSalvageStones, tmStoneCost, tmStoneDrops, tmStoneName } from '../src/constants/technomagic.js';
import { DEFAULTS } from '../src/config.js';
import { findSpec } from '../src/lib/settings-spec.js';
import { ITEMS_BY_ID } from '../src/data/items.js';
import { isTmPiece, krMainValue, tmStoneClass } from '../src/data/kr-gear.js';
import { copyMainStat } from '../src/lib/game/heroes.js';
import { rollReclaimed, rollTmStones, tmCraftPool } from '../src/lib/game/technomagic.js';
import { refineState } from '../src/web/models/gear.js';
import { itemSalvage } from '../src/lib/game/items/sell.js';
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

test("salvaging: a TechnoMagic piece gives its class's Upgrade Stones and no komaDust (King's Raid's has none), a dragon set's piece its komaDust", () => {
  assert.equal(itemSalvage(item(ARMOR)), 0);
  const dragon = [...ITEMS_BY_ID.values()].find((one) => one.kr && one.kr.tier === 8 && !isTmPiece(one)) as ItemDef;
  assert.ok(itemSalvage(dragon) > 0);
  const view = heroesView(
    [
      { _id: 'r', itemId: ARMOR, level: 0, locked: false, reclaimed: true, tmSkill: undefined, tmPotentials: undefined },
      { _id: 'n', itemId: ARMOR, level: 0, locked: false, tmSkill: undefined, tmPotentials: undefined },
      { _id: 'd', itemId: dragon.id, level: 0, locked: false, tmSkill: undefined, tmPotentials: undefined },
    ],
    { heroes: {}, points: 0, gems: 0, essences: {} },
  );
  const of = (id: string) => view.copies.find((copy) => copy.id === id);
  assert.deepEqual([of('r')?.salvage, of('r')?.salvageStones], [0, { class: 'knight', count: 2 }]);
  assert.deepEqual([of('n')?.salvage, of('n')?.salvageStones], [0, { class: 'knight', count: 1 }]);
  assert.equal(of('d')?.salvageStones, undefined);
  assert.ok((of('d')?.salvage ?? 0) > 0);
});

test("Boss Crystals: a win's its boss's, more the higher the stage; salvaging a piece 100 (Reclaimed 200, King's Raid's); an option reroll 300", () => {
  assert.deepEqual([1, 5, 9, 12].map(tmCrystalDrops), [100, 250, 500, 500]);
  assert.equal(tmSalvageCrystals(), 100);
  assert.equal(tmSalvageCrystals(true), 200);
  assert.equal(TM_CRYSTALS.reroll, 300);
  assert.equal(tmCrystalName('perseverance'), 'Crystal of Galgoria');
  assert.equal(tmCrystalName('authority'), 'Crystal of Ascalon');
});

test("crafting TechnoMagic gear: King's Raid's three ways, for crystals and thousands of zeiucoins", () => {
  assert.deepEqual(DEFAULTS.craft.tm, { any: { crystals: 1000, points: 1000 }, part: { crystals: 2000, points: 3000 }, exact: { crystals: 4000, points: 9000 } });
  assert.equal(DEFAULTS.craft.reclaimed, 0.05);
  for (const key of ['craft.tm.any.crystals', 'craft.tm.exact.points', 'craft.reclaimed']) assert.ok(findSpec(key), key);
  const any = tmCraftPool('perseverance', 'any', null, null);
  assert.ok(any.length >= 49 && any.every((piece) => piece.kr?.set === 'perseverance' && piece.kr.part !== 'artifact'));
  const armor = tmCraftPool('hope', 'part', 'armor', null);
  assert.equal(armor.length, 7, "every class's armor");
  assert.deepEqual(tmCraftPool('hope', 'exact', 'armor', 'priest').map((piece) => piece.kr?.classes), [['priest']]);
  assert.equal(tmCraftPool('hope', 'exact', 'accessory', 'priest').length, 4, 'an accessory: any of its four kinds');
  assert.equal(tmCraftPool('hope', 'part', null, null).length, 0, 'a part needed');
  assert.equal(tmCraftPool('hope', 'exact', 'armor', null).length, 0, 'a class needed');
});

test("heroes page: a TechnoMagic piece's rerolls and salvage in its set's crystals, and their crystals by set", () => {
  const view = heroesView(
    [{ _id: 'n', itemId: ARMOR, level: 0, locked: false, tmSkill: undefined, tmPotentials: undefined, options: [{ stat: 'atk', step: 0 }, { stat: 'atk', step: 0 }] }],
    { heroes: {}, points: 0, gems: 0, essences: {}, crystals: { perseverance: 777 } },
  );
  const copy = view.copies[0];
  assert.equal(copy?.rerollCrystals, 'perseverance');
  assert.equal(copy?.reroll, 300);
  assert.deepEqual(copy?.salvageCrystals, { set: 'perseverance', count: 100 });
  assert.deepEqual(view.crystals, { perseverance: 777, hope: 0, authority: 0 });
});
