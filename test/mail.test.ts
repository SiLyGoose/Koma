import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HERO_BANNER, ITEMS_BY_ID } from '../src/data/items.js';
import { KR_GRANTS, rollRuneOfGrade } from '../src/data/kr-gear.js';
import { heroBannerPool } from '../src/lib/game/items/gacha.js';
import { mailTarget, parseMailCommand, parseReward } from '../src/lib/game/mail.js';
import { selectorItem } from '../src/services/mail.js';
import { attachmentView, MAIL_HEROES } from '../src/web/models/mail.js';

test('mail command: whom to, the title, the message and the rewards', () => {
  assert.deepEqual(parseMailCommand('all | Maintenance | Thanks for waiting! | points:5000, uw, gems:20'), {
    ok: true,
    to: 'all',
    title: 'Maintenance',
    message: 'Thanks for waiting!',
    attachments: [
      { kind: 'points', amount: 5000 },
      { kind: 'selector', of: 'uw' },
      { kind: 'gems', amount: 20 },
    ],
  });
  const one = parseMailCommand('<@123456789012345678> | Sorry | For the bug. | item:perseverance-warrior-ringx2 rune:fierce-5 ut');
  assert.ok(one.ok && one.to === '123456789012345678');
  assert.deepEqual(one.ok && one.attachments, [
    { kind: 'item', itemId: 'perseverance-warrior-ring', count: 2 },
    { kind: 'rune', runeId: 'fierce-5', count: 1 },
    { kind: 'selector', of: 'ut' },
  ]);
  // No rewards: just a letter.
  assert.deepEqual(parseMailCommand('all | Hi | Hello there').ok && parseMailCommand('all | Hi | Hello there'), { ok: true, to: 'all', title: 'Hi', message: 'Hello there', attachments: [] });
  assert.deepEqual(parseMailCommand('nobody | Hi | x'), { ok: false, reason: 'bad_target', detail: 'nobody' });
  assert.deepEqual(parseMailCommand('all | Hi | x | item:nope'), { ok: false, reason: 'bad_reward', detail: 'item:nope' });
  assert.deepEqual(parseMailCommand('all | Hi'), { ok: false, reason: 'usage' });
  assert.equal(mailTarget('everyone'), 'all');
  assert.equal(parseReward('points:0'), null);
  assert.equal(parseReward('item:uw-selector'), null, 'a ticket is sent as uw or ut');
});

test('mail: a selector is any hero’s unique weapon, or any of a hero’s four unique treasures, picked as it is claimed', () => {
  assert.equal(selectorItem('uw', { hero: 'klaus' })?.uniqueWeapon, 'klaus');
  assert.equal(selectorItem('ut', { hero: 'klaus', skill: 3 })?.uniqueTreasure?.skill, 3);
  assert.equal(selectorItem('ut', { hero: 'klaus' }), undefined, "a unique treasure's skill picked too");
  assert.equal(selectorItem('uw', { hero: 'nobody' }), undefined);
  assert.equal(MAIL_HEROES.every((hero) => hero.treasures.length === 4 && hero.weapon !== null), true, 'every hero has its unique weapon and four unique treasures to pick');
  // Each as its ticket's popup shows it: a new copy's main stat (ATK, MAX HP) and its unique effect.
  const items = MAIL_HEROES.flatMap((hero) => [hero.weapon, ...hero.treasures]);
  assert.deepEqual(items.filter((item) => !item?.main || item.main.value <= 0 || !item.effect).map((item) => item?.itemId), []);
  assert.deepEqual(attachmentView({ kind: 'selector', of: 'uw' }), { text: 'Unique Weapon Ticket', icon: 'WEAPON_UNIQUE_SELECT_ITEM', selector: 'uw', picked: null });
  // Claimed: what it was picked as, beside it.
  const exian = selectorItem('uw', { hero: 'klaus' });
  assert.deepEqual(attachmentView({ kind: 'selector', of: 'uw' }, exian?.id).picked, { itemId: exian?.id, name: exian?.name });
  assert.equal(attachmentView({ kind: 'points', amount: 5000 }).text, '5,000 zeiucoins');
  assert.equal(attachmentView({ kind: 'gems', amount: 10 }).currency, 'gems', 'a currency says which, for its emoji');
});

test("hero item banner: below its top tier, King's Raid's kinds: artifacts and tickets, dragon sets' pieces, and runes; never the members' own gear", () => {
  for (let i = 0; i < 200; i++) {
    for (const item of heroBannerPool(3)) assert.ok(item.kr?.part === 'artifact' || item.grant !== undefined, item.id);
    for (const item of heroBannerPool(2)) assert.equal(item.kr?.tier, HERO_BANNER.highTier, item.id);
    for (const item of heroBannerPool(1)) assert.ok(item.kr?.tier === HERO_BANNER.lowTier || item.grant !== undefined, item.id);
  }
  for (const grant of KR_GRANTS) assert.equal(ITEMS_BY_ID.get(grant.id), grant);
  assert.equal(KR_GRANTS.filter((one) => one.grant && 'selector' in one.grant).length, 2);
  assert.ok(rollRuneOfGrade(6)?.endsWith('-5'), 'a Legendary rune');
});
