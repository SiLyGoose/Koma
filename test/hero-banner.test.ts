import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PITY_STARS } from '../src/constants/index.js';
import { HEROES } from '../src/data/heroes.js';
import { CONFIG } from '../src/config.js';
import { gachaItems, HERO_BANNER, UNIQUE_TREASURES, UNIQUE_WEAPONS, validateItems } from '../src/data/items.js';
import { bannerWeights, guaranteeChoices, nextGuarantee, pulledLevel, rollItem, rollPulls, topChance } from '../src/lib/game/items/gacha.js';
import { BANNERS } from '../src/types.js';

/*
 * The Hero Item banner: its 4-star pulls are the heroes' unique weapons and unique treasures (half each, each of a kind
 * as likely), its lower ones the standard banner's, with its own weights and pity and no guarantee; and no other banner
 * ever gives one.
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
    assert.equal(rollItem(90, HXLON, false).uniqueTreasure, undefined);
    assert.equal(rollItem(90, HXLON, false, 1, 'limited').uniqueTreasure, undefined);
  }
});

test('hero banner: every 4-star is a unique weapon or a unique treasure, half each, each of a kind about as likely, and the rest are standard items', () => {
  const draws = 20_000;
  const counts = new Map<string, number>();
  let weapons = 0;
  for (let i = 0; i < draws; i++) {
    const got = rollItem(90, HXLON, true, 1, 'hero');
    assert.ok(got.uniqueWeapon !== undefined || got.uniqueTreasure !== undefined, got.id);
    if (got.uniqueWeapon !== undefined) weapons++;
    counts.set(got.id, (counts.get(got.id) ?? 0) + 1);
  }
  assert.ok(Math.abs(weapons / draws - HERO_BANNER.weaponShare) < 0.02, `${weapons} unique weapons`);
  assert.equal(counts.size, UNIQUE_WEAPONS.length + UNIQUE_TREASURES.length);
  for (const one of UNIQUE_WEAPONS) assert.ok(Math.abs((counts.get(one.id) ?? 0) / weapons - 1 / UNIQUE_WEAPONS.length) < 0.03, one.id);
  for (const one of UNIQUE_TREASURES) assert.ok(Math.abs((counts.get(one.id) ?? 0) / (draws - weapons) - 1 / UNIQUE_TREASURES.length) < 0.01, one.id);
  // Below the top tier, the standard banner's items.
  for (let i = 0; i < 2000; i++) {
    const got = rollItem(1, HXLON, false, 1, 'hero');
    if (got.stars < PITY_STARS) assert.ok(gachaItems(got.stars).includes(got), got.id);
  }
});

test('hero banner: its own weights, King’s Raid’s 2% for its top tier (a unique weapon 1%, a unique treasure 1%)', () => {
  assert.equal(bannerWeights('hero'), CONFIG.gacha.heroStarWeights);
  assert.equal(bannerWeights('standard'), CONFIG.gacha.starWeights);
  assert.ok(Math.abs(topChance(1, bannerWeights('hero')) - 0.02) < 1e-9);
  assert.ok(topChance(1, bannerWeights('hero')) > topChance(1));
  // Its pity as the standard one's: the top tier at hard pity.
  assert.equal(topChance(CONFIG.gacha.pity.hardPity, bannerWeights('hero')), 1);
});

test('hero banner: a unique weapon now and then comes refined (King’s Raid’s 0★ to 3★ odds), a unique treasure always at R1', () => {
  const weapon = UNIQUE_WEAPONS[0]!;
  const treasure = UNIQUE_TREASURES[0]!;
  const total = HERO_BANNER.weaponLevels.reduce((sum, weight) => sum + weight, 0);
  assert.equal(pulledLevel(weapon, 0), 1);
  assert.equal(pulledLevel(weapon, 8.99 / total), 1);
  assert.equal(pulledLevel(weapon, 9.01 / total), 2);
  assert.equal(pulledLevel(weapon, (9 + 0.15 + 0.01) / total), 3);
  assert.equal(pulledLevel(weapon, 0.9999), 4);
  for (const roll of [0, 0.5, 0.9999]) assert.equal(pulledLevel(treasure, roll), 1);
  assert.equal(pulledLevel(gachaItems(4)[0]!, 0.9999), 1);
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
