import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { handleApi, type ApiDeps } from '../src/web/api.js';
import type { WebConfig } from '../src/web/config.js';
import type { BannerPull, BannerResult, BannerView, GachaStore } from '../src/web/gacha.js';
import { signSession } from '../src/web/login.js';

const SITE: WebConfig = {
  siteUrl: 'https://koma-ui.vercel.app',
  origin: 'https://koma-ui.vercel.app',
  apiUrl: 'https://koma.duckdns.org',
  socketUrl: 'wss://koma.duckdns.org',
  port: 0,
  clientSecret: 'shh',
};

test('banner page: a logged-in member sees the banner and pulls in their own servers only', async () => {
  const view: BannerView = {
    cost: 90,
    baseCost: 100,
    multi: 10,
    balance: 1000,
    tokens: 1,
    topStars: 4,
    pity: { count: 3, softStart: 60, hardPity: 80 },
    guaranteed: false,
    own: { itemId: 'c4', name: 'C4', stars: 4, slot: 'treasure' },
    rates: { 1: 0.6, 2: 0.3, 3: 0.09, 4: 0.01 },
  };
  const item: BannerPull = { itemId: 'rusty-dagger', name: 'Rusty Dagger', stars: 1, slot: 'weapon', description: '', isNew: true, count: 1, borrowed: null };
  const pulls: { guildId: string; userId: string; multi: boolean }[] = [];
  const store: GachaStore = {
    view: async () => view,
    pull: async (guildId, userId, multi): Promise<BannerResult | 'too_poor'> => {
      if (guildId === 'g1' && multi && userId === 'u1' && pulls.some((p) => p.multi)) return 'too_poor'; // the second multi pull is too much
      pulls.push({ guildId, userId, multi });
      return { pulls: Array.from({ length: multi ? 10 : 1 }, () => item), cost: multi ? 810 : 0, tokensUsed: 1, view };
    },
  };
  const deps: ApiDeps = {
    config: SITE,
    clientId: () => '999',
    guild: (id) => (id === 'g1' || id === 'g2' ? { name: id, icon: null } : null),
    memberName: async (guildId, userId) => (guildId === 'g1' && userId === 'u1' ? 'ZEIU' : null),
    balance: async () => 0,
    gacha: store,
  };
  const session = signSession({ userId: 'u1', name: 'ZEIU', avatar: null, guildIds: ['g1', 'g2'] }, 'shh');
  const headers = { Origin: SITE.origin, 'Content-Type': 'application/json', Authorization: `Bearer ${session}` };
  const post = (body: unknown, auth = headers): RequestInit => ({ method: 'POST', headers: auth, body: JSON.stringify(body) });

  const server: Server = createServer((req, res) => void handleApi(req, res, deps));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const get = await fetch(`${base}/api/gacha?guild=g1`, { headers });
    assert.equal(get.status, 200);
    assert.deepEqual(await get.json(), view);
    assert.equal((await fetch(`${base}/api/gacha?guild=g2`, { headers })).status, 403); // left that server
    assert.equal((await fetch(`${base}/api/gacha?guild=g3`, { headers })).status, 403);
    assert.equal((await fetch(`${base}/api/gacha`, { headers })).status, 400);
    assert.equal((await fetch(`${base}/api/gacha?guild=g1`, { headers: { Origin: SITE.origin } })).status, 401);

    const one = await fetch(`${base}/api/gacha/pull`, post({ guild: 'g1' }));
    assert.equal(one.status, 200);
    assert.equal(((await one.json()) as BannerResult).pulls.length, 1);
    const ten = await fetch(`${base}/api/gacha/pull`, post({ guild: 'g1', multi: true }));
    assert.equal(((await ten.json()) as BannerResult).pulls.length, 10);
    const poor = await fetch(`${base}/api/gacha/pull`, post({ guild: 'g1', multi: true }));
    assert.equal(poor.status, 409);
    assert.deepEqual(await poor.json(), { error: 'too_poor' });

    assert.equal((await fetch(`${base}/api/gacha/pull`, post({ guild: 'g1', multi: 'yes' }))).status, 400);
    assert.equal((await fetch(`${base}/api/gacha/pull`, post({ guild: 'g2' }))).status, 403);
    assert.equal((await fetch(`${base}/api/gacha/pull`, { method: 'GET', headers })).status, 400); // no server asked about
    assert.deepEqual(pulls, [
      { guildId: 'g1', userId: 'u1', multi: false },
      { guildId: 'g1', userId: 'u1', multi: true },
    ]);
  } finally {
    server.close();
  }
});
