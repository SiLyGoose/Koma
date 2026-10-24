import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KR_RUNES, KR_RUNES_BY_ID, rollRuneOfGrade } from '../src/data/kr-gear.js';
import { RUNE_BOXES, RUNE_FRAGMENTS, RUNE_KEEP_PRICE, RUNE_SELL_POINTS } from '../src/protocol/runes.js';

const first = { index: () => 0 };
const last = { index: (max: number) => max - 1 };

test("runes: selling and disassembling give half King's Raid's (its SellGold and RuneItemBreakTable), by grade", () => {
  const sellGold = { 1: 400, 2: 700, 3: 1_300, 4: 2_300, 5: 3_900, 6: 6_600 };
  const breakFragments = { 1: 16, 2: 40, 3: 100, 4: 250, 5: 625, 6: 1_000 };
  for (const grade of [1, 2, 3, 4, 5, 6] as const) {
    assert.equal(RUNE_SELL_POINTS[grade], Math.floor(sellGold[grade] / 2));
    assert.equal(RUNE_FRAGMENTS[grade], Math.floor(breakFragments[grade] / 2));
  }
  // (Every rune has a grade with a price.)
  for (const rune of KR_RUNES) assert.ok(RUNE_SELL_POINTS[rune.grade] && RUNE_FRAGMENTS[rune.grade], rune.id);
  assert.equal(RUNE_KEEP_PRICE, 100);
});

test("runes: each Mysterious Rune crafted gives a rune of its grade, the Ancient one an Ancient rune", () => {
  for (const box of RUNE_BOXES) {
    for (const rng of [first, last]) {
      const id = rollRuneOfGrade(box.grade, rng, box.id === 'ancient');
      const rune = id ? KR_RUNES_BY_ID.get(id) : undefined;
      assert.ok(rune, box.id);
      assert.equal(rune.grade, box.grade, box.id);
      assert.equal(rune.ancient === true, box.id === 'ancient', box.id);
    }
  }
  // (King's Raid's fragment costs: CraftItemTable PACKAGE_RUNE_2/3/4/40.)
  assert.deepEqual(RUNE_BOXES.map((box) => box.fragments), [100, 250, 650, 2_000]);
});
