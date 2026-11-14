import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ITEMS_BY_ID, UNIQUE_WEAPONS } from '../src/data/items.js';
import { historyFilter, pulledFrom, PULL_REASONS } from '../src/lib/game/items/history.js';

test('pull history: a pull from before banners were written down goes on the banner its item comes from', () => {
  const item = (id: string) => ITEMS_BY_ID.get(id);
  assert.equal(pulledFrom(item('rusty-dagger')), 'standard');
  assert.equal(pulledFrom(item('uw-selector')), 'hero');
  assert.equal(pulledFrom(item('rune-box-rare')), 'hero');
  const weapon = UNIQUE_WEAPONS[0];
  if (weapon) assert.equal(pulledFrom(weapon), 'hero');
  const kr = [...ITEMS_BY_ID.values()].find((one) => one.kr !== undefined);
  if (kr) assert.equal(pulledFrom(kr), 'hero');
  const limited = [...ITEMS_BY_ID.values()].find((one) => one.limited);
  if (limited) assert.equal(pulledFrom(limited), 'limited');
  // (An item no longer in the game: the standard banner's.)
  assert.equal(pulledFrom(undefined), 'standard');
});

test('pull history: a banner finds the pulls that say it, and those from before by their item', () => {
  const standard = historyFilter('g1', 'u1', 'standard') as Record<string, any>;
  assert.equal(standard.guildId, 'g1');
  assert.equal(standard.userId, 'u1');
  assert.deepEqual(standard.reason, { $in: [...PULL_REASONS] });
  assert.deepEqual(standard.$or[0], { banner: 'standard' });
  // Before: any item but the Hero Item banner's own and the limited banner's.
  assert.ok(standard.$or[1].itemId.$nin.includes('uw-selector'));
  assert.ok(!standard.$or[1].itemId.$nin.includes('rusty-dagger'));
  const hero = historyFilter('g1', 'u1', 'hero') as Record<string, any>;
  assert.deepEqual(hero.$or[0], { banner: 'hero' });
  assert.ok(hero.$or[1].itemId.$in.includes('uw-selector'));
  assert.ok(!hero.$or[1].itemId.$in.includes('rusty-dagger'));
  assert.deepEqual(hero.$or[1].banner, { $exists: false });
});
