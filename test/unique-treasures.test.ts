import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HEROES } from '../src/data/heroes.js';
import { gachaItems, ITEMS_BY_ID, UNIQUE_TREASURES, validateItems } from '../src/data/items.js';
import { UT_OPTION_LINES } from '../src/data/tm-potentials.js';
import { fitsSlot, heroItemLines, heroOnly, heroSlotsFor, heroWearable, pieceBonus, raidGear, SIDE_SLOTS, wieldedBy } from '../src/lib/game/heroes.js';
import { enhanceUtOptions, rollUtOptions } from '../src/lib/game/technomagic.js';
import { TM_POTENTIAL_RANGES } from '../src/data/tm-potentials.js';
import { heroesView } from '../src/web/models/heroes.js';
import { replay, uniqueTreasureText } from '../vendor/technomagic-sim.mjs';
import type { MemberDoc, TmPotential } from '../src/types.js';

/*
 * The heroes' unique treasures (ItemDef.uniqueTreasure): four for each hero, as King's Raid's, only from the Hero Item
 * banner and only on their own hero. One in its treasure slot is its main treasure (its effect in the raid); up to three
 * more go in its sub treasure slots, giving only their options; each of its four once.
 */

const item = (id: string) => ITEMS_BY_ID.get(id)!;
const OPTIONS: TmPotential[] = [
  { stat: 'atk', value: 0.1 },
  { stat: 'crit', value: 0.08 },
];

test('unique treasures: four for each hero (UT1 to UT4), the sim’s own, never on the standard banner, heroes only', () => {
  validateItems();
  assert.equal(UNIQUE_TREASURES.length, HEROES.length * 4);
  for (const hero of HEROES) {
    const own = UNIQUE_TREASURES.filter((one) => one.uniqueTreasure?.hero === hero.id);
    assert.deepEqual(own.map((one) => one.uniqueTreasure?.skill).sort(), [1, 2, 3, 4], hero.id);
    // Each is the sim's, by name, with what it does at every tier.
    for (const one of own) {
      const skill = one.uniqueTreasure!.skill;
      for (const tier of [1, 2, 3, 4, 5]) assert.equal(uniqueTreasureText(hero.id, skill, tier)?.name.replace(/'/g, '’'), one.name.replace(/'/g, '’'), `${one.id} ★${tier}`);
    }
  }
  for (const one of UNIQUE_TREASURES) {
    assert.equal(one.slot, 'treasure');
    assert.ok(!gachaItems(one.stars).includes(one), `${one.id} is in the standard pool`);
    assert.ok(heroWearable(one) && heroOnly(one), one.id);
  }
});

test('unique treasures: only on their own hero, in its treasure slot or a sub treasure slot', () => {
  const cape = item('cape-of-justice');
  assert.ok(wieldedBy(cape, 'klaus') && !wieldedBy(cape, 'kirze'));
  assert.deepEqual(heroSlotsFor(cape), ['treasure', ...SIDE_SLOTS]);
  for (const slot of SIDE_SLOTS) assert.ok(fitsSlot(cape, slot), slot);
  assert.ok(!fitsSlot(cape, 'weapon1') && !fitsSlot(cape, 'armor1'));
  // Any other treasure only in the treasure slot.
  for (const slot of SIDE_SLOTS) assert.ok(!fitsSlot(item('piplup'), slot), slot);
});

test('unique treasures: a copy rolls two different options; wherever it is worn it gives them, as main treasure its effect too', () => {
  for (let i = 0; i < 50; i++) {
    const rolled = rollUtOptions();
    assert.equal(rolled.length, UT_OPTION_LINES);
    assert.equal(new Set(rolled.map(({ stat }) => stat)).size, UT_OPTION_LINES);
  }
  const cape = item('cape-of-justice');
  assert.ok(Math.abs(pieceBonus({ item: cape, level: 1, potentials: OPTIONS }, 'knight', 'klaus').atk - 0.1) < 1e-9);
  assert.equal(pieceBonus({ item: cape, level: 1, potentials: OPTIONS }, 'knight', 'kirze').atk, 0);
  const lines = heroItemLines(cape, 3, OPTIONS);
  assert.equal(lines.length, 3);
  assert.match(lines[2] ?? '', /^Klaus only, as main treasure, ★3: \[Cut Ground\] Increases DMG target receives by 17%/);
  // Its HP (King's Raid's, the same for every hero) only as the main treasure.
  assert.equal(pieceBonus({ item: cape, level: 5, potentials: OPTIONS, main: true }, 'knight', 'klaus').hpFlat, 2_265_983);
  assert.equal(pieceBonus({ item: cape, level: 1, potentials: OPTIONS, main: true }, 'knight', 'klaus').hpFlat, 997_027);
  assert.equal(pieceBonus({ item: cape, level: 5, potentials: OPTIONS }, 'knight', 'klaus').hpFlat, 0);
});

test('unique treasures: the raid is told the main one alone; the sub ones count only their options, and each of the four once', () => {
  const copies = [
    { _id: 'main', itemId: 'firm-determination', level: 4, tmPotentials: OPTIONS },
    { _id: 's1', itemId: 'cape-of-justice', level: 5, tmPotentials: [{ stat: 'atk' as const, value: 0.05 }] },
    { _id: 's2', itemId: 'mittens', level: 2, tmPotentials: [{ stat: 'hp' as const, value: 0.1 }] },
    { _id: 'dup', itemId: 'mittens', level: 5, tmPotentials: [{ stat: 'hp' as const, value: 0.12 }] },
  ];
  const member: Pick<MemberDoc, 'heroes'> = { heroes: { klaus: { boughtAt: new Date(0), equipment: { treasure: 'main', side1: 's1', side2: 's2', side3: 'dup' } } } };
  const gear = raidGear(copies, member).get('klaus')!;
  assert.deepEqual(gear.ut, { skill: 2, tier: 4 });
  // The main one's HP (R4), none of the sub ones'.
  assert.equal(gear.bonus.hpFlat, 1_812_791);
  // Main's options and the sub ones', but not the second Mittens.
  assert.ok(Math.abs(gear.bonus.atk - 0.15) < 1e-9);
  assert.ok(Math.abs(gear.bonus.hp - 0.1) < 1e-9);
  assert.deepEqual(gear.copies, ['main', 's1', 's2']);
  const view = heroesView(copies, member).heroes.find((hero) => hero.id === 'klaus')!;
  assert.equal(view.equipped.side3, null);
  assert.equal(view.treasure?.name, 'Firm Determination');
  assert.equal(view.treasure?.tier, 4);
  // Only a unique treasure has sub treasures: with none (or another treasure) as the main one, they count for nothing.
  const side = raidGear(copies, { heroes: { klaus: { boughtAt: new Date(0), equipment: { side1: 'main' } } } }).get('klaus')!;
  assert.equal(side.ut, null);
  assert.equal(side.bonus.hpFlat, 0);
  assert.equal(side.bonus.atk, 0);
  assert.deepEqual(side.copies, []);
  const under = [...copies, { _id: 'pip', itemId: 'piplup', level: 1 }];
  assert.equal(heroesView(under, { heroes: { klaus: { boughtAt: new Date(0), equipment: { treasure: 'pip', side1: 's1' } } } }).heroes.find((hero) => hero.id === 'klaus')?.equipped.side1, null);
  // Another hero's: nothing.
  assert.equal(raidGear(copies, { heroes: { kirze: { boughtAt: new Date(0), equipment: { treasure: 'main' } } } }).get('kirze')?.ut, null);
});

test('unique treasures: the main one changes its hero’s fight, the same every time; one the fight doesn’t know is none', () => {
  const run = (ut: { skill: number; tier: number } | null) =>
    replay({ boss: 'galgoria', seed: 7, stage: 1, heroes: [{ id: 'kirze', skin: 0, gear: { hpFlat: 40_000_000, hp: 3, defense: 2 }, ut }, { id: 'klaus', skin: 0, gear: { hpFlat: 40_000_000, hp: 3, defense: 2 } }] }, []);
  const plain = run(null);
  // Lotus of Crimson Crystal: Blade of Judgment cheaper and harder.
  const lotus = run({ skill: 1, tier: 5 });
  assert.notDeepEqual(lotus.sums, plain.sums);
  assert.deepEqual(run({ skill: 1, tier: 5 }).sums, lotus.sums);
  assert.deepEqual(run({ skill: 9, tier: 5 }).sums, plain.sums);
});

test("unique treasures: the stats King's Raid adds roll in their ranges (Recovery by half percents); enhancing raises one a step, never past its top", () => {
  const added = { acc: [0.05, 0.11], dodgePhysical: [0.11, 0.22], dodgeMagical: [0.11, 0.22], critResistPhysical: [0.11, 0.22], critResistMagical: [0.11, 0.22], recovery: [0.075, 0.15], manaDamage: [0.11, 0.22] } as const;
  for (const [stat, [min, max]] of Object.entries(added)) assert.deepEqual(TM_POTENTIAL_RANGES[stat as keyof typeof added], { min, max });
  const seen = new Set<string>();
  for (let i = 0; i < 3000; i++) {
    for (const { stat, value } of rollUtOptions()) {
      seen.add(stat);
      const { min, max } = TM_POTENTIAL_RANGES[stat];
      assert.ok(value >= min - 1e-9 && value <= max + 1e-9, `${stat} ${value}`);
      const step = stat === 'recovery' ? 0.005 : 0.01;
      assert.ok(Math.abs(value / step - Math.round(value / step)) < 1e-6, `${stat} ${value} off its steps`);
    }
  }
  for (const stat of Object.keys(added)) assert.ok(seen.has(stat), `${stat} never rolled`);

  // The option picked rolled again anywhere in its range (its steps: recovery's half percents), the other as it was; at its top too.
  const options: TmPotential[] = [{ stat: 'recovery', value: 0.145 }, { stat: 'acc', value: 0.11 }];
  assert.deepEqual(enhanceUtOptions(options, 0, { index: () => 0 }), [{ stat: 'recovery', value: 0.075 }, { stat: 'acc', value: 0.11 }]);
  assert.deepEqual(enhanceUtOptions(options, 0, { index: () => 1 }), [{ stat: 'recovery', value: 0.08 }, { stat: 'acc', value: 0.11 }]);
  assert.deepEqual(enhanceUtOptions(options, 1, { index: () => 0 }), [{ stat: 'recovery', value: 0.145 }, { stat: 'acc', value: 0.05 }]);
  assert.deepEqual(enhanceUtOptions(options, 1, { index: (n) => n - 1 }), [{ stat: 'recovery', value: 0.145 }, { stat: 'acc', value: 0.11 }]);
  assert.equal(enhanceUtOptions(options, 2), null);
  for (let i = 0; i < 200; i++) {
    const [{ value }] = enhanceUtOptions([{ stat: 'atk', value: 0.12 }], 0)!;
    assert.ok(value >= 0.05 - 1e-9 && value <= 0.12 + 1e-9 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, `atk ${value}`);
  }
});
