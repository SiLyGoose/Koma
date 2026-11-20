import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import { gachaItems } from '../src/data/items.js';
import { exclusiveTreasures, guaranteeChoices, guaranteeTargets, nextGuarantee, ownTreasures, rollItem } from '../src/lib/game/items/gacha.js';
import { PITY_STARS } from '../src/constants/index.js';

/*
 * The standard banner's guarantee can be picked to give any exclusive treasure (anyone's), not just their own: their
 * own first among the choices. Picked, it is for that one alone; with nothing picked (or one of their own), any of
 * their own, as before.
 */

const someone = (): string => {
  const owner = exclusiveTreasures().find((item) => item.usableBy?.length)?.usableBy?.[0];
  assert.ok(owner, 'an exclusive treasure with an owner');
  return owner;
};

test('standard banner: every exclusive treasure can be picked, their own first, and no other top-tier item', () => {
  const userId = someone();
  const choices = guaranteeChoices(userId, 'standard');
  const own = ownTreasures(userId);
  assert.deepEqual(choices.slice(0, own.length), own);
  assert.deepEqual(new Set(choices.map((item) => item.id)), new Set(exclusiveTreasures().map((item) => item.id)));
  for (const item of gachaItems(PITY_STARS)) assert.equal(choices.includes(item), (item.usableBy?.length ?? 0) > 0);
  // Someone with no treasure of their own can pick any of them too.
  assert.equal(guaranteeChoices('nobody', 'standard').length, exclusiveTreasures().length);
});

test("standard banner: someone else's treasure picked is guaranteed after a top-tier that isn't it; their own still count when none is", () => {
  const userId = someone();
  const [mine] = ownTreasures(userId);
  const theirs = exclusiveTreasures().find((item) => !item.usableBy?.includes(userId));
  assert.ok(mine && theirs);
  // Nothing picked: their own, as before.
  assert.deepEqual(guaranteeTargets(userId, 'standard').gives, ownTreasures(userId));
  assert.equal(nextGuarantee(userId, theirs, 'standard'), true);
  assert.equal(nextGuarantee(userId, mine, 'standard'), false);
  // Someone else's picked: only it clears it, their own sets it.
  assert.equal(nextGuarantee(userId, mine, 'standard', theirs.id), true);
  assert.equal(nextGuarantee(userId, theirs, 'standard', theirs.id), false);
  const { hardPity } = CONFIG.gacha.pity;
  if (hardPity > 0) for (let i = 0; i < 30; i++) assert.equal(rollItem(hardPity, userId, true, 1, 'standard', undefined, theirs.id).id, theirs.id);
  // No treasure of their own: nothing picked, no guarantee; one picked, it is.
  assert.equal(nextGuarantee('nobody', theirs, 'standard'), false);
  assert.equal(nextGuarantee('nobody', mine, 'standard', theirs.id), true);
});
