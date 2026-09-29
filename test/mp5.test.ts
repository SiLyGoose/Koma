import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import { TEXT } from '../src/constants/index.js';
import { ITEMS_BY_ID } from '../src/data/items.js';
import { MEMBERS } from '../src/data/members.js';
import { canUseItem, describeEffects, totalEffects } from '../src/lib/game/items/equipment.js';
import { anyRollHits, emptyTotals, robRolls, robSuccessChance } from '../src/perks/index.js';

const MP5 = ITEMS_BY_ID.get('mp5')!;
const round = (n: number): number => Math.round(n * 1e6) / 1e6;

test('mp5: the MP5 is a 4-star unique treasure, only for its owner', () => {
  assert.deepEqual({ name: MP5.name, stars: MP5.stars, slot: MP5.slot }, { name: 'MP5', stars: 4, slot: 'treasure' });
  assert.equal(MEMBERS.LVMYMP5K, '177216253587488770');
  assert.ok(canUseItem(MP5, '177216253587488770'));
  assert.ok(!canUseItem(MP5, '137980346393165824'));
});

test('mp5: 3 rolls at every refine level, recoil -20% at R1 down to -15% at R5; half as many extra rolls when borrowed', () => {
  const gearAt = (level: number) => totalEffects([{ item: MP5, level }]);
  for (const level of [1, 2, 3, 4, 5]) assert.equal(robRolls(gearAt(level)), 3, `R${level} rolls`);
  assert.deepEqual([1, 2, 3, 4, 5].map((level) => round(gearAt(level).burstRecoil)), [0.2, 0.19, 0.18, 0.17, 0.15]);
  assert.equal(robRolls(totalEffects([MP5], '137980346393165824')), 2);
  assert.equal(robRolls({}), 1);
});

test('mp5: recoil lowers every roll, and any of the 3 hitting succeeds', () => {
  const gear = totalEffects([MP5]);
  const each = robSuccessChance(0.5, CONFIG.rob, gear, emptyTotals());
  assert.equal(round(each), 0.35);
  assert.equal(round(anyRollHits(each, robRolls(gear))), round(1 - 0.65 ** 3));
  assert.equal(anyRollHits(0.5, 1), 0.5);
});

test('mp5: the gear card and the rob messages read right', () => {
  assert.deepEqual(describeEffects(MP5, 1, 5), [
    "Burst fire: every rob gets 3 tries to succeed, and you're only caught if all of them miss",
    'Recoil: -15% rob success chance on every try',
  ]);
  assert.equal(TEXT.rob.footerRolls('45%', 3, '83.4%'), 'Success chance: 45% x3 (83.4% overall)');
  assert.match(TEXT.rob.rollHit(2, 3), /shot 2 of 3/);
  assert.match(TEXT.rob.rollsMissed(3), /All 3 shots missed/);
});
