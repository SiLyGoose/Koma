import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PITY_STARS } from '../src/constants/index.js';
import { HEROES } from '../src/data/heroes.js';
import { gachaItems, UNIQUE_WEAPONS, validateItems } from '../src/data/items.js';
import { guaranteeChoices, nextGuarantee, rollItem, rollPulls } from '../src/lib/game/items/gacha.js';
import { BANNERS } from '../src/types.js';

/*
 * The Hero Item banner: its 4-star pulls are the heroes' unique weapons, each as likely, its lower ones the
 * standard banner's, with its own pity and no guarantee; and no other banner ever gives a unique weapon.
 */

const HXLON = '262072810422140929';

test('hero banner: a banner of its own, whose unique weapons no other banner gives', () => {
  validateItems();
  assert.ok(BANNERS.includes('hero'));
  assert.equal(UNIQUE_WEAPONS.length, HEROES.length);
  for (const one of UNIQUE_WEAPONS) {
    assert.equal(one.stars, PITY_STARS, one.id);
    assert.ok(!gachaItems(one.stars).includes(one), `${one.id} is in the standard pool`);
  }
  // Hard pity on the standard and limited banners never gives one.
  for (let i = 0; i < 2000; i++) {
    assert.equal(rollItem(90, HXLON, false).uniqueWeapon, undefined);
    assert.equal(rollItem(90, HXLON, false, 1, 'limited').uniqueWeapon, undefined);
  }
});

test('hero banner: every 4-star is a unique weapon, each about as likely, and the rest are standard items', () => {
  const draws = 9000;
  const counts = new Map<string, number>();
  for (let i = 0; i < draws; i++) {
    const got = rollItem(90, HXLON, true, 1, 'hero');
    assert.ok(got.uniqueWeapon !== undefined, got.id);
    counts.set(got.id, (counts.get(got.id) ?? 0) + 1);
  }
  assert.equal(counts.size, UNIQUE_WEAPONS.length);
  for (const [id, count] of counts) assert.ok(Math.abs(count / draws - 1 / UNIQUE_WEAPONS.length) < 0.03, `${id}: ${count}`);
  // Below the top tier, the standard banner's items.
  for (let i = 0; i < 2000; i++) {
    const got = rollItem(1, HXLON, false, 1, 'hero');
    if (got.stars < PITY_STARS) assert.ok(gachaItems(got.stars).includes(got), got.id);
  }
});

test('hero banner: no guarantee, nothing to pick, and its pity starts over on a unique weapon', () => {
  assert.deepEqual(guaranteeChoices(HXLON, 'hero'), []);
  for (const one of UNIQUE_WEAPONS) assert.equal(nextGuarantee(HXLON, one, 'hero'), false);
  const weapon = UNIQUE_WEAPONS[0]!;
  const filler = gachaItems(1)[0]!;
  // Every third pull since the last gives a unique weapon (pulls 3 and 6): the counter starts over after each
  // (two pulls since, after 8), and nothing is ever guaranteed.
  const result = rollPulls(0, 8, true, (n) => (n === 3 ? weapon : filler), { userId: HXLON, banner: 'hero', guaranteed: true });
  assert.deepEqual(result.items.map((one) => one === weapon), [false, false, true, false, false, true, false, false]);
  assert.equal(result.counter, 2);
  assert.equal(result.guaranteed, false);
});
