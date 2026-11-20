import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { KR_ITEMS_BY_ID } from '../src/data/kr-gear.js';
import { salvageMatches } from '../src/lib/game/items/salvage.js';
import type { SalvageRule } from '../src/protocol/heroes.js';
import { cleanRule, salvagesDrop } from '../src/services/items/salvage.js';
import { createApi, type ApiDeps } from '../src/web/api.js';
import { signSession } from '../src/web/auth/login.js';
import type { WebConfig } from '../src/web/config.js';
import { heroesView, type HeroesView, type HeroStore } from '../src/web/models/heroes.js';

const SITE: WebConfig = {
  siteUrl: 'https://koma-ui.vercel.app',
  origin: 'https://koma-ui.vercel.app',
  apiUrl: 'https://koma.duckdns.org',
  socketUrl: 'wss://koma.duckdns.org',
  port: 0,
  clientSecret: 'shh',
};

const rule = (over: Partial<SalvageRule> = {}): SalvageRule => ({ tiers: [6, 7], stars: 0, parts: [], classes: [], ...over });
const piece = (id: string) => KR_ITEMS_BY_ID.get(id)!;

test('salvage rule: the tiers and stars it takes, then its parts and classes (none picked: any)', () => {
  const bow = { tier: 6, stars: 0, part: 'weapon' as const, classes: ['archer'] };
  assert.equal(salvageMatches(rule(), bow), true);
  assert.equal(salvageMatches(rule({ tiers: [7] }), bow), false);
  assert.equal(salvageMatches(rule(), { ...bow, stars: 1 }), false, 'more stars than it takes');
  assert.equal(salvageMatches(rule({ stars: 2 }), { ...bow, stars: 1 }), true);
  assert.equal(salvageMatches(rule({ parts: ['armor'] }), bow), false);
  assert.equal(salvageMatches(rule({ parts: ['armor', 'weapon'] }), bow), true);
  assert.equal(salvageMatches(rule({ classes: ['archer'] }), bow), true);
  assert.equal(salvageMatches(rule({ classes: ['knight'] }), bow), false);
  // Gear other classes wear too is kept, unless every one of them is picked.
  const plate = { tier: 6, stars: 0, part: 'armor' as const, classes: ['knight', 'warrior'] };
  assert.equal(salvageMatches(rule({ classes: ['knight'] }), plate), false);
  assert.equal(salvageMatches(rule({ classes: ['knight', 'warrior'] }), plate), true);
  assert.equal(salvageMatches(rule({ classes: ['knight'] }), { ...plate, classes: [] }), false, 'gear any class wears');
  // Never anything but King's Raid's T6 to T9.
  assert.equal(salvageMatches(rule({ tiers: [6, 7, 8, 9, 10] }), { ...bow, tier: 10 }), false);
  assert.equal(salvageMatches(rule(), { ...bow, tier: null }), false);
});

test('salvage rule: kept clean, and one that takes no tier is none', () => {
  assert.deepEqual(cleanRule({ tiers: [9, 6, 6, 10], stars: 9, parts: ['artifact', 'orb'], classes: ['bard', 'priest'] } as never), { tiers: [6, 9], stars: 5, parts: ['orb'], classes: ['priest'] });
  assert.equal(cleanRule({ tiers: [], stars: 0, parts: [], classes: [] }), null);
  assert.equal(cleanRule(null), null);
});

test('salvage rule: a drop it takes is salvaged (at 0★, as drops come); artifacts and unique gear never', () => {
  assert.equal(salvagesDrop(rule(), piece('opportune-fire-t6-archer-weapon')), true);
  assert.equal(salvagesDrop(rule({ classes: ['knight'] }), piece('opportune-fire-t7-heavy-armor')), false);
  assert.equal(salvagesDrop(rule({ classes: ['knight', 'warrior'] }), piece('opportune-fire-t7-heavy-armor')), true);
  assert.equal(salvagesDrop(rule({ tiers: [9] }), piece('hope-assassin-orb')), true);
  assert.equal(salvagesDrop(rule({ tiers: [6, 7, 8, 9] }), piece('artifact-1001')), false);
  assert.equal(salvagesDrop(null, piece('opportune-fire-t6-archer-weapon')), false);
});

test('salvage rule: the heroes page says theirs, and keeps the one it is sent', async () => {
  assert.deepEqual(heroesView([], { heroes: {}, points: 0, gems: 0, essences: {}, autoSalvage: rule({ tiers: [8] }) }).autoSalvage, rule({ tiers: [8] }));
  assert.equal(heroesView([], { heroes: {}, points: 0, gems: 0, essences: {} }).autoSalvage, null);

  const kept: (SalvageRule | null)[] = [];
  const empty = heroesView([], null);
  const store = {
    view: async () => empty,
    autoSalvage: async (_guildId: string, _userId: string, sent: SalvageRule | null): Promise<HeroesView> => {
      kept.push(sent);
      return { ...empty, autoSalvage: sent };
    },
  } as unknown as HeroStore;
  const deps: ApiDeps = { config: SITE, clientId: () => '999', guild: () => ({ name: 'g1', icon: null }), memberName: async () => 'ZEIU', balance: async () => 0, heroes: store };
  const session = signSession({ userId: 'u1', name: 'ZEIU', avatar: null, guildIds: ['g1'] }, 'shh');
  const headers = { Origin: SITE.origin, 'Content-Type': 'application/json', Authorization: `Bearer ${session}` };
  const server: Server = createServer(createApi(deps));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (body: unknown) => fetch(`${base}/api/heroes/auto-salvage`, { method: 'POST', headers, body: JSON.stringify({ guild: 'g1', ...(body as object) }) });
  try {
    const on = await post({ rule: rule({ parts: ['orb'], classes: ['priest'] }) });
    assert.equal(on.status, 200);
    assert.deepEqual(((await on.json()) as HeroesView).autoSalvage, rule({ parts: ['orb'], classes: ['priest'] }));
    assert.equal((await post({ rule: null })).status, 200);
    assert.deepEqual(kept, [rule({ parts: ['orb'], classes: ['priest'] }), null]);
    // Only what a rule can take.
    for (const bad of [rule({ tiers: [10] }), rule({ stars: 6 }), rule({ parts: ['artifact'] }), rule({ classes: ['bard' as never] }), { tiers: [6] }]) assert.equal((await post({ rule: bad })).status, 400, JSON.stringify(bad));
    assert.equal((await post({})).status, 400);
    assert.equal(kept.length, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
