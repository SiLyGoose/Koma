import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { bossInfoEmbed, bossRewardsText } from '../src/commands/raid.js';
import { DEFAULTS } from '../src/config.js';
import { GEM_EMOJI, RAID_DIFFICULTY, RAID_SHOP_STARS } from '../src/constants/index.js';
import { RAID_DROPS } from '../src/data/items.js';
import { raidRewards } from '../src/lib/events/raid.js';
import { raidShopStock, refreshPrice, refreshesUsed } from '../src/lib/game/items/raid-shop.js';
import { findSpec, validateSettings } from '../src/lib/settings-spec.js';
import { createApi, type ApiDeps } from '../src/web/api.js';
import { signSession } from '../src/web/auth/login.js';
import type { WebConfig } from '../src/web/config.js';
import type { RaidShopStore, RaidShopView } from '../src/web/models/raid-shop.js';

const SITE: WebConfig = {
  siteUrl: 'https://koma-ui.vercel.app',
  origin: 'https://koma-ui.vercel.app',
  apiUrl: 'https://koma.duckdns.org',
  socketUrl: 'wss://koma.duckdns.org',
  port: 0,
  clientSecret: 'shh',
};

test('raid rewards: every level past 1 pays 500 more, and the komaGems only go up at levels 5 and 10', () => {
  // (Once over: the Weekly Boss pays all of it raid.weeklyMultiplier times, 5 by default.)
  const cfg = { ...DEFAULTS.raid, weeklyMultiplier: 1 };
  assert.equal(DEFAULTS.raid.weeklyMultiplier, 5);
  assert.deepEqual(raidRewards(1, DEFAULTS.raid), { points: 5_000, tokens: 50, gems: 25, essences: 75 });
  assert.equal(cfg.rewardPerLevel, 500);
  assert.equal(cfg.gemRewardMilestone, 5);
  const ladder = Array.from({ length: RAID_DIFFICULTY.max }, (_, i) => raidRewards(i + 1, cfg));
  assert.deepEqual(
    ladder.map((paid) => paid.points),
    [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500],
  );
  assert.deepEqual(
    ladder.map((paid) => paid.gems),
    [5, 5, 5, 5, 10, 10, 10, 10, 10, 15],
  );
  assert.ok(ladder.every((paid) => paid.tokens === cfg.tokenReward), 'the komaTokens are the same at every level');
  // Out of range, it is the nearest level; with both steps at 0, every level pays what level 1 does.
  assert.deepEqual(raidRewards(0, cfg), ladder[0]);
  assert.deepEqual(raidRewards(99, cfg), ladder[9]);
  assert.deepEqual(raidRewards(10, { ...cfg, rewardPerLevel: 0, gemRewardMilestone: 0, essenceRewardPerLevel: 0 }), { points: 1000, tokens: 10, gems: 5, essences: 15 });
});

test('raid rewards: both steps are settings, and the boss info says how the harder levels pay more', () => {
  for (const key of ['raid.rewardPerLevel', 'raid.gemRewardMilestone', 'raid.weeklyMultiplier']) assert.equal(findSpec(key)?.group, 'Raid', key);
  // (Its steps up are paid raid.weeklyMultiplier times over too.)
  assert.ok(bossRewardsText(DEFAULTS.raid).includes('**2,500** <:zeiucoin:1551675032424546320> more for every level past 1'));
  const once = { ...DEFAULTS.raid, weeklyMultiplier: 1 };
  const text = bossRewardsText(once);
  assert.ok(text.includes('**Harder levels pay more**'), text);
  assert.ok(text.includes('**500** <:zeiucoin:1551675032424546320> more for every level past 1'), text);
  assert.ok(text.includes(`**5** ${GEM_EMOJI} more from level 5, and again from level 10`), text);
  assert.ok(bossRewardsText(once, 5).includes(`**10** ${GEM_EMOJI}`), 'at level 5 it says what level 5 pays');
  const wyrm = bossRewardsText(once, 1, 'wyrm');
  assert.ok(wyrm.includes('**15** each of the Justice, Force and Strategy hero essences'), wyrm);
  assert.ok(wyrm.includes('and **5** of each hero essence 💠 more for every level past 1'), wyrm);
  assert.ok(bossRewardsText(once, 3, 'wyrm').includes('**25** each of the'), 'at level 3 it says what level 3 pays');
  assert.ok(!bossRewardsText({ ...DEFAULTS.raid, rewardPerLevel: 0, gemRewardMilestone: 0 }).includes('Harder levels'), 'nothing to say with both at 0');
  assert.ok(!bossRewardsText({ ...DEFAULTS.raid, rewardPerLevel: 0, gemRewardMilestone: 0, essenceRewardPerLevel: 0 }, 1, 'wyrm').includes('Harder levels'), 'nor with all three at 0');
  const info = bossInfoEmbed(DEFAULTS.raid).toJSON().fields?.find((f) => f.name === 'Rewards')?.value ?? '';
  assert.ok(info.includes('Harder levels pay more'), info);
});

test('raid shop: four 4-star and four 3-star raid items for 10 and 5 komaGems, all of it settings', () => {
  assert.deepEqual(DEFAULTS.raid.shop, { price: { 3: 5, 4: 10 }, stock: { 3: 4, 4: 4 }, refreshCost: 5, refreshes: 5 });
  for (const stars of RAID_SHOP_STARS) {
    assert.equal(findSpec(`raid.shop.price.${stars}`)?.group, 'Raid');
    assert.equal(findSpec(`raid.shop.stock.${stars}`)?.group, 'Raid');
  }
  assert.deepEqual(validateSettings(structuredClone(DEFAULTS)).filter((problem) => problem.includes('raid.')), []);

  const stock = raidShopStock('g1', '2026-10-10', DEFAULTS.raid.shop);
  assert.deepEqual(
    stock.map((entry) => [entry.item.stars, entry.price]),
    [...Array(4).fill([4, 10]), ...Array(4).fill([3, 5])],
    'the best tier first, each at its tier\'s price',
  );
  assert.ok(stock.every((entry) => entry.item.raidDrop), 'only raid items');
  assert.equal(new Set(stock.map((entry) => entry.item.id)).size, 8, 'each once');
});

test('raid shop: a server\'s shelf is the same all week, and changes with the week and the server', () => {
  const ids = (guildId: string, week: string, shop = DEFAULTS.raid.shop): string[] => raidShopStock(guildId, week, shop).map((entry) => entry.item.id);
  assert.deepEqual(ids('g1', '2026-10-10'), ids('g1', '2026-10-10'));
  // Over many weeks every raid item of both tiers turns up, and the shelves differ from week to week and server to server.
  const weeks = Array.from({ length: 40 }, (_, i) => `week-${i}`);
  const seen = new Set(weeks.flatMap((week) => ids('g1', week)));
  assert.equal(seen.size, RAID_DROPS.filter((item) => item.stars >= 3).length);
  assert.ok(new Set(weeks.map((week) => ids('g1', week).join())).size > 20);
  assert.ok(weeks.some((week) => ids('g1', week).join() !== ids('g2', week).join()));

  // A bigger shelf only adds to what was on it; one bigger than the tier sells it all; an empty one sells none.
  const bigger = ids('g1', '2026-10-10', { ...DEFAULTS.raid.shop, stock: { 3: 4, 4: 6 } });
  for (const id of ids('g1', '2026-10-10')) assert.ok(bigger.includes(id), id);
  assert.equal(bigger.length, 10);
  assert.equal(ids('g1', '2026-10-10', { ...DEFAULTS.raid.shop, stock: { 3: 0, 4: 99 } }).length, RAID_DROPS.filter((item) => item.stars === 4).length);
  // In the catalog's order within a tier.
  const order = RAID_DROPS.map((item) => item.id);
  const fours = raidShopStock('g1', '2026-10-10', DEFAULTS.raid.shop).filter((entry) => entry.item.stars === 4).map((entry) => order.indexOf(entry.item.id));
  assert.deepEqual(fours, [...fours].sort((a, b) => a - b));
});

test('raid shop: a refresh costs 5 komaGems, then 5 more each time, five times a week, both of them settings', () => {
  const shop = DEFAULTS.raid.shop;
  for (const key of ['raid.shop.refreshCost', 'raid.shop.refreshes']) assert.equal(findSpec(key)?.group, 'Raid', key);
  assert.deepEqual(
    Array.from({ length: 7 }, (_, used) => refreshPrice(used, shop)),
    [5, 10, 15, 20, 25, null, null],
  );
  assert.equal(refreshPrice(0, { refreshCost: 5, refreshes: 0 }), null, 'off with no refreshes a week');
  assert.equal(refreshPrice(2, { refreshCost: 0, refreshes: 3 }), 0, 'free with no cost');
  // What's kept on a member only counts in its own week.
  assert.equal(refreshesUsed(undefined, '2026-10-10'), 0);
  assert.equal(refreshesUsed({ week: '2026-10-10', refreshes: 3 }, '2026-10-10'), 3);
  assert.equal(refreshesUsed({ week: '2026-10-03', refreshes: 5 }, '2026-10-10'), 0);
});

test("raid shop: a refreshed shelf is that member's alone, and each refresh gives another", () => {
  const shop = DEFAULTS.raid.shop;
  const ids = (userId: string | null, refreshes = 0): string => raidShopStock('g1', '2026-10-10', shop, userId === null ? null : { userId, refreshes }).map((entry) => entry.item.id).join();
  // Until they refresh, a member's shelf is the server's.
  assert.equal(ids('u1', 0), ids(null));
  assert.equal(ids('u1', 2), ids('u1', 2), 'the same every time it is asked for');
  const shelves = new Set([0, 1, 2, 3, 4, 5].map((n) => ids('u1', n)));
  assert.ok(shelves.size >= 5, 'refreshes give different shelves');
  assert.ok([1, 2, 3, 4, 5].some((n) => ids('u1', n) !== ids('u2', n)), "and two members' differ");
  // Still four of each tier, at the same prices.
  const fresh = raidShopStock('g1', '2026-10-10', shop, { userId: 'u1', refreshes: 3 });
  assert.deepEqual(fresh.map((entry) => [entry.item.stars, entry.price]), [...Array(4).fill([4, 10]), ...Array(4).fill([3, 5])]);
});

test('raid shop web: a logged-in member sees the shelf and buys with komaGems, in their own servers only', async () => {
  const shelf = raidShopStock('g1', '2026-10-10', DEFAULTS.raid.shop);
  let state = { gems: 12, owned: {} as Record<string, number>, used: 0 };
  const view = (): RaidShopView => ({
    refresh: { max: 5, left: 5 - state.used, price: refreshPrice(state.used, DEFAULTS.raid.shop) },
    items: shelf.map(({ item, price }) => ({ id: item.id, name: item.name, stars: item.stars, slot: item.slot, description: item.description, effects: [], price, owned: state.owned[item.id] ?? 0 })),
    gems: state.gems,
    resetsAt: 1_800_000_000_000,
  });
  const calls: string[] = [];
  const store: RaidShopStore = {
    view: async () => view(),
    buy: async (guildId, userId, id) => {
      calls.push(`buy ${guildId} ${userId} ${id}`);
      const entry = shelf.find((e) => e.item.id === id);
      if (!entry) return 'not_found';
      if (state.gems < entry.price) return 'too_poor';
      state = { ...state, gems: state.gems - entry.price, owned: { ...state.owned, [id]: (state.owned[id] ?? 0) + 1 } };
      return view();
    },
    refresh: async (guildId, userId) => {
      calls.push(`refresh ${guildId} ${userId}`);
      const price = refreshPrice(state.used, DEFAULTS.raid.shop);
      if (price === null) return 'no_refreshes';
      if (state.gems < price) return 'too_poor';
      state = { ...state, gems: state.gems - price, used: state.used + 1 };
      return view();
    },
  };
  const deps: ApiDeps = {
    config: SITE,
    clientId: () => '999',
    guild: (id) => (id === 'g1' || id === 'g2' ? { name: id, icon: null } : null),
    memberName: async (guildId, userId) => (guildId === 'g1' && userId === 'u1' ? 'ZEIU' : null),
    balance: async () => 0,
    raidShop: store,
  };
  const session = signSession({ userId: 'u1', name: 'ZEIU', avatar: null, guildIds: ['g1', 'g2'] }, 'shh');
  const headers = { Origin: SITE.origin, 'Content-Type': 'application/json', Authorization: `Bearer ${session}` };
  const buy = (body: unknown) => fetch(`${base}/api/raid-shop/buy`, { method: 'POST', headers, body: JSON.stringify(body) });

  const server: Server = createServer(createApi(deps));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const get = await fetch(`${base}/api/raid-shop?guild=g1`, { headers });
    assert.equal(get.status, 200);
    assert.deepEqual(await get.json(), view());
    assert.equal((await fetch(`${base}/api/raid-shop?guild=g2`, { headers })).status, 403); // left that server
    assert.equal((await fetch(`${base}/api/raid-shop`, { headers })).status, 400);
    assert.equal((await fetch(`${base}/api/raid-shop?guild=g1`, { headers: { Origin: SITE.origin } })).status, 401);

    // A 4-star one for 10 of their 12 komaGems, then they can't afford another, but can a 3-star one... once they have 5.
    const four = shelf[0]?.item.id as string;
    const three = shelf[4]?.item.id as string;
    const bought = await buy({ guild: 'g1', item: four });
    assert.equal(bought.status, 200);
    const after = (await bought.json()) as RaidShopView;
    assert.equal(after.gems, 2);
    assert.equal(after.items[0]?.owned, 1);
    const poor = await buy({ guild: 'g1', item: three });
    assert.equal(poor.status, 409);
    assert.deepEqual(await poor.json(), { error: 'too_poor' });

    // Not on the shelf, and a request that doesn't say what.
    const missing = await buy({ guild: 'g1', item: 'not-an-item' });
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: 'not_found' });
    assert.equal((await buy({ guild: 'g1' })).status, 400);
    assert.deepEqual(calls, [`buy g1 u1 ${four}`, `buy g1 u1 ${three}`, 'buy g1 u1 not-an-item']);

    // A refresh they can't pay for (2 komaGems left, it costs 5), then one they can, then none left.
    const refresh = () => fetch(`${base}/api/raid-shop/refresh`, { method: 'POST', headers, body: JSON.stringify({ guild: 'g1' }) });
    const short = await refresh();
    assert.equal(short.status, 409);
    assert.deepEqual(await short.json(), { error: 'too_poor' });
    state = { ...state, gems: 20 };
    const fresh = await refresh();
    assert.equal(fresh.status, 200);
    assert.deepEqual(((await fresh.json()) as RaidShopView).refresh, { max: 5, left: 4, price: 10 });
    assert.equal(state.gems, 15);
    state = { ...state, used: 5 };
    const none = await refresh();
    assert.equal(none.status, 409);
    assert.deepEqual(await none.json(), { error: 'no_refreshes' });
    assert.equal((await fetch(`${base}/api/raid-shop/refresh`, { method: 'POST', headers, body: JSON.stringify({ guild: 'g2' }) })).status, 403);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('raid shop web: 10,000 komaDust crafts a Unique Weapon or Unique Treasure Ticket, held until used for a hero’s item', async () => {
  assert.equal(DEFAULTS.sell.powderPerSelector, 10_000);
  assert.ok(findSpec('sell.powderPerSelector'), 'a setting');
  let state = { powder: 25_000, selectors: { uw: 0, ut: 0 } };
  const view = (): RaidShopView => ({ refresh: { max: 5, left: 5, price: 5 }, items: [], gems: 0, resetsAt: 1_800_000_000_000, powder: state.powder, powderPerGem: 1000, powderPerSelector: 10_000, selectors: { ...state.selectors } });
  const calls: string[] = [];
  const store: RaidShopStore = {
    view: async () => view(),
    buy: async () => 'not_found',
    refresh: async () => 'no_refreshes',
    craft: async (_guildId, _userId, count, recipe) => {
      calls.push(`craft ${count} ${recipe}`);
      if (recipe === 'gem') return view();
      if (state.powder < count * 10_000) return 'too_poor';
      state = { powder: state.powder - count * 10_000, selectors: { ...state.selectors, [recipe]: state.selectors[recipe] + count } };
      return view();
    },
    use: async (_guildId, _userId, of, pick) => {
      calls.push(`use ${of} ${pick.hero} ${pick.skill ?? '-'}`);
      if (pick.hero !== 'kirze') return 'bad_pick';
      if (state.selectors[of] < 1) return 'not_owned';
      state = { ...state, selectors: { ...state.selectors, [of]: state.selectors[of] - 1 } };
      return { ...view(), given: of === 'uw' ? 'Kirze’s weapon' : 'Kirze’s treasure' };
    },
  };
  const deps: ApiDeps = { config: SITE, clientId: () => '999', guild: (id) => (id === 'g1' ? { name: id, icon: null } : null), memberName: async () => 'ZEIU', balance: async () => 0, raidShop: store };
  const session = signSession({ userId: 'u1', name: 'ZEIU', avatar: null, guildIds: ['g1'] }, 'shh');
  const headers = { Origin: SITE.origin, 'Content-Type': 'application/json', Authorization: `Bearer ${session}` };
  const server: Server = createServer(createApi(deps));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown) => fetch(`${base}/api/raid-shop/${path}`, { method: 'POST', headers, body: JSON.stringify({ guild: 'g1', ...(body as object) }) });
  try {
    // komaGems by default, as before.
    assert.equal((await post('craft', { count: 2 })).status, 200);
    // Two tickets of their 25,000, then not a third.
    const crafted = await post('craft', { count: 2, recipe: 'ut' });
    assert.equal(crafted.status, 200);
    assert.deepEqual(((await crafted.json()) as RaidShopView).selectors, { uw: 0, ut: 2 });
    const poor = await post('craft', { count: 1, recipe: 'uw' });
    assert.equal(poor.status, 409);
    assert.deepEqual(await poor.json(), { error: 'too_poor' });
    assert.equal((await post('craft', { count: 1, recipe: 'nope' })).status, 400);

    // Used: one less held, and what it gave; a weapon they hold none of, a hero with none, a skill past 4.
    const used = await post('use', { of: 'ut', hero: 'kirze', skill: 3 });
    assert.equal(used.status, 200);
    const after = (await used.json()) as RaidShopView & { given: string };
    assert.equal(after.given, 'Kirze’s treasure');
    assert.deepEqual(after.selectors, { uw: 0, ut: 1 });
    const none = await post('use', { of: 'uw', hero: 'kirze' });
    assert.equal(none.status, 409);
    assert.deepEqual(await none.json(), { error: 'not_owned' });
    assert.deepEqual(await (await post('use', { of: 'ut', hero: 'nobody', skill: 1 })).json(), { error: 'bad_pick' });
    assert.equal((await post('use', { of: 'ut', hero: 'kirze', skill: 5 })).status, 400);
    assert.deepEqual(calls, ['craft 2 gem', 'craft 2 ut', 'craft 1 uw', 'use ut kirze 3', 'use uw kirze -', 'use ut nobody 1']);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
