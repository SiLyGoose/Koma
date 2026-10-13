import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG, DEFAULTS } from '../src/config.js';
import { PITY_STARS, TEXT } from '../src/constants/index.js';
import { ITEMS, ITEMS_BY_ID, LIMITED_BANNER, featuredItems, gachaItems, itemsByStars, validateItems } from '../src/data/items.js';
import { bannerTime, limitedWindow } from '../src/lib/game/items/banner.js';
import { itemBlock } from '../src/lib/game/items/databank.js';
import { describeEffects, totalEffects } from '../src/lib/game/items/equipment.js';
import { nextGuarantee, rollItem, rollPulls } from '../src/lib/game/items/gacha.js';
import { checkConstraints, findSpec, parseInput } from '../src/lib/settings-spec.js';
import { extraPullChance, jobEarnings, pullCost } from '../src/perks/index.js';
import type { ItemDef, Stars } from '../src/types.js';

const item = (stars: Stars): ItemDef => ({ id: `t${stars}`, name: `Test ${stars}`, stars, slot: 'weapon', description: '', effects: [] });
const byId = (id: string): ItemDef => ITEMS_BY_ID.get(id) as ItemDef;
const HXLON = '262072810422140929';

test('limited banner: its featured items are limited 4-stars the standard banner never gives', () => {
  validateItems();
  const featured = featuredItems();
  assert.deepEqual(featured.map((one) => one.id), [...LIMITED_BANNER.featured]);
  assert.deepEqual(featured.map((one) => one.id), ['pot-of-greed', 'employee-of-the-month']);
  for (const one of featured) {
    assert.equal(one.stars, PITY_STARS, one.id);
    assert.equal(one.limited, true, one.id);
    assert.ok(!gachaItems(one.stars).includes(one), `${one.id} is in the standard pool`);
  }
  // Every limited item is left out of the standard banner, featured or not.
  assert.ok(ITEMS.filter((one) => one.limited).every((one) => !gachaItems(one.stars).includes(one)));
  // Hard pity on the standard banner never gives one.
  for (let i = 0; i < 2000; i++) assert.ok(!rollItem(90, HXLON, false).limited);
});

test('limited banner: a 4-star is a featured item 3 times in 4, and a standard one the rest', () => {
  assert.equal(DEFAULTS.gacha.limited.featuredChance, 0.75);
  const draws = 20_000;
  const counts = new Map<string, number>();
  for (let i = 0; i < draws; i++) {
    const got = rollItem(90, HXLON, false, 1, 'limited', 0.75);
    assert.equal(got.stars, PITY_STARS);
    counts.set(got.id, (counts.get(got.id) ?? 0) + 1);
  }
  const featured = featuredItems();
  const share = (id: string): number => (counts.get(id) ?? 0) / draws;
  const hit = featured.reduce((sum, one) => sum + share(one.id), 0);
  assert.ok(Math.abs(hit - 0.75) < 0.02, `featured share ${hit}`);
  // The featured items are equally likely, and the rest is spread over every standard 4-star.
  for (const one of featured) assert.ok(Math.abs(share(one.id) - 0.75 / featured.length) < 0.02, one.id);
  for (const one of gachaItems(4)) assert.ok(counts.has(one.id), `${one.id} never came off banner`);
  for (const one of itemsByStars(4).filter((i) => i.raidDrop)) assert.ok(!counts.has(one.id), `${one.id} was pulled`);
  // The lower tiers are the standard banner's.
  for (let i = 0; i < 2000; i++) {
    const got = rollItem(1, HXLON, false, 1, 'limited');
    if (got.stars !== PITY_STARS) assert.ok(gachaItems(got.stars).includes(got), got.id);
  }
});

test('limited banner: the guarantee is set by a 4-star that is not featured and cleared by one that is', () => {
  const [greed] = featuredItems() as [ItemDef];
  assert.equal(nextGuarantee(HXLON, byId('c4'), 'limited'), true);
  assert.equal(nextGuarantee(undefined, byId('equalizer'), 'limited'), true, 'it needs no treasure of their own');
  assert.equal(nextGuarantee(HXLON, byId('frog'), 'limited'), true, 'their own treasure is still off banner');
  assert.equal(nextGuarantee(HXLON, greed, 'limited'), false);
  // A guaranteed 4-star there is always featured, whatever the chance.
  for (let i = 0; i < 500; i++) assert.ok(rollItem(90, HXLON, true, 1, 'limited', 0).limited);
  // And the standard banner's guarantee is left as it was.
  assert.equal(nextGuarantee(HXLON, byId('c4')), true);
  assert.equal(nextGuarantee(HXLON, greed), true);
  assert.equal(nextGuarantee(undefined, byId('c4')), false);

  // Carried through a multi pull, without a member id.
  const seen: boolean[] = [];
  const order = [item(1), byId('c4'), item(2), greed, item(3)];
  const { guaranteed, counter } = rollPulls(0, order.length, true, (_n, g) => {
    seen.push(g);
    return order[seen.length - 1] as ItemDef;
  }, { banner: 'limited' });
  assert.deepEqual(seen, [false, false, true, true, false]);
  assert.equal(guaranteed, false);
  assert.equal(counter, 1);
});

test('limited banner: open from its start to its end, on the Eastern clock', () => {
  assert.deepEqual(DEFAULTS.gacha.limited, { start: 'off', end: 'off', featuredChance: 0.75 });
  assert.equal(limitedWindow(DEFAULTS.gacha.limited).open, false);
  assert.equal(bannerTime('off'), null);
  // Midnight Eastern is 04:00 UTC in daylight time and 05:00 in winter.
  assert.equal(bannerTime('2026-10-13'), Date.UTC(2026, 9, 13, 4));
  assert.equal(bannerTime('2026-12-01 18:30'), Date.UTC(2026, 11, 1, 23, 30));
  assert.ok(Number.isNaN(bannerTime('2026-02-30')));
  assert.ok(Number.isNaN(bannerTime('2026-10-13 25:00')));
  assert.ok(Number.isNaN(bannerTime('soon')));

  const settings = { start: '2026-10-13', end: '2026-10-27 12:00' };
  const start = Date.UTC(2026, 9, 13, 4);
  const end = Date.UTC(2026, 9, 27, 16);
  assert.deepEqual(limitedWindow(settings, start - 1), { open: false, start, end });
  assert.equal(limitedWindow(settings, start).open, true);
  assert.equal(limitedWindow(settings, end - 1).open, true);
  assert.equal(limitedWindow(settings, end).open, false);
  // No end: open for good once started. No start: closed, whatever the end.
  assert.equal(limitedWindow({ start: '2026-10-13', end: 'off' }, end + 1e12).open, true);
  assert.equal(limitedWindow({ start: 'off', end: '2026-10-27' }, start).open, false);
});

test('limited banner: its settings take dates, and refuse ones that are not', () => {
  const spec = findSpec('gacha.limited.start');
  assert.ok(spec);
  assert.deepEqual(parseInput(spec, '2026-10-13'), { ok: true, value: '2026-10-13' });
  assert.deepEqual(parseInput(spec, '2026-10-13  18:00'), { ok: true, value: '2026-10-13 18:00' });
  assert.deepEqual(parseInput(spec, '2026-10-13T18:00'), { ok: true, value: '2026-10-13 18:00' });
  assert.deepEqual(parseInput(spec, 'OFF'), { ok: true, value: 'off' });
  assert.equal(parseInput(spec, 'tomorrow').ok, false);
  assert.ok(findSpec('gacha.limited.end') && findSpec('gacha.limited.featuredChance')?.percent);

  const withLimited = (limited: Partial<typeof CONFIG.gacha.limited>) => ({ ...DEFAULTS, gacha: { ...DEFAULTS.gacha, limited: { ...DEFAULTS.gacha.limited, ...limited } } });
  assert.equal(checkConstraints(withLimited({ start: '2026-10-13', end: '2026-10-27' })), null);
  assert.equal(checkConstraints(withLimited({ start: '2026-10-13' })), null);
  assert.equal(checkConstraints(withLimited({ start: '2026-10-27', end: '2026-10-13' })), 'gacha.limited.start must be before gacha.limited.end');
  assert.equal(checkConstraints(withLimited({ start: '2026-02-30' })), 'gacha.limited.start is not a real date');
  assert.equal(checkConstraints(withLimited({ end: '2026-13-01' })), 'gacha.limited.end is not a real date');
});

test('Pot of Greed: pulls cost more and can give a second item, which counts for no pity', () => {
  const greed = byId('pot-of-greed');
  const cfg = CONFIG.equipment;
  const full = totalEffects([greed]);
  assert.equal(extraPullChance(full), cfg.potOfGreed[4]);
  assert.equal(pullCost(1000, full), Math.round(1000 * (1 + cfg.greedCost[4])));
  // At R1 the chance is 40% of that, and the cost is the same.
  const r1 = totalEffects([{ item: greed, level: 1 }]);
  assert.ok(Math.abs(extraPullChance(r1) - cfg.potOfGreed[4] * 0.4) < 1e-9);
  assert.equal(pullCost(1000, r1), pullCost(1000, full));
  assert.equal(extraPullChance({}), 0);
  assert.equal(describeEffects(greed).length, 2);

  // Every pull gives a second item at a 100% chance, rolled as a first pull and never counted.
  const numbers: number[] = [];
  const roll = (n: number): ItemDef => {
    numbers.push(n);
    return item(1);
  };
  const all = rollPulls(5, 3, true, roll, { extraChance: 1 });
  assert.equal(all.items.length, 3);
  assert.equal(all.extras.length, 3);
  assert.deepEqual(numbers, [6, 1, 7, 1, 8, 1]);
  assert.equal(all.counter, 8);
  // None without the perk, and the pulls are numbered as ever.
  numbers.length = 0;
  const none = rollPulls(5, 3, true, roll);
  assert.deepEqual(none.extras, []);
  assert.deepEqual(numbers, [6, 7, 8]);

  // A second item of the top tier leaves the pity count alone, but follows and moves the guarantee.
  const guarantees: boolean[] = [];
  const order = [item(1), byId('c4'), item(1), featuredItems()[0] as ItemDef];
  const extra = rollPulls(10, 2, true, (_n, g) => {
    guarantees.push(g);
    return order[guarantees.length - 1] as ItemDef;
  }, { banner: 'limited', extraChance: 1 });
  assert.equal(extra.counter, 12);
  assert.deepEqual(extra.extras.map((one) => one.stars), [4, 4]);
  assert.deepEqual(guarantees, [false, false, true, true]);
  assert.equal(extra.guaranteed, false);

  // A multi pull's minimum tier looks at the pulls paid for, not at what came on top.
  const floors: Stars[] = [];
  rollPulls(0, 3, true, (_n, _g, floor) => {
    floors.push(floor);
    return item(floors.length === 2 ? 3 : 1); // the first pull's second item is a 3-star
  }, { extraChance: 1 }, 3);
  assert.deepEqual(floors, [1, 1, 1, 1, 3, 1]);
});

test('Employee of the Month: jobs pay more', () => {
  const employee = byId('employee-of-the-month');
  assert.deepEqual([employee.stars, employee.slot, employee.effects], [4, 'armor', ['jobPay']]);
  const rate = CONFIG.equipment.jobPay[4];
  assert.equal(jobEarnings(1000, totalEffects([employee])), Math.round(1000 * (1 + rate)));
  assert.equal(jobEarnings(1000, {}), 1000);
  assert.equal(jobEarnings(1000, totalEffects([byId('pot-of-greed')])), 1000);
});

test('limited banner: the databank says where a limited item comes from', () => {
  assert.ok(itemBlock(byId('pot-of-greed')).endsWith(TEXT.databank.limited));
  assert.ok(!itemBlock(byId('equalizer')).includes(TEXT.databank.limited));
});
