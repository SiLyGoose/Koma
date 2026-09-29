import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { REFINE } from '../src/constants/index.js';
import { ITEMS } from '../src/data/items.js';
import { describeEffects } from '../src/lib/game/items/equipment.js';
import { handleApi } from '../src/web/api.js';
import type { WebConfig } from '../src/web/config.js';
import { databankView } from '../src/web/databank.js';

const SITE: WebConfig = {
  siteUrl: 'https://koma-ui.vercel.app',
  origin: 'https://koma-ui.vercel.app',
  apiUrl: 'https://koma.duckdns.org',
  socketUrl: 'wss://koma.duckdns.org',
  port: 0,
  clientSecret: 'shh',
};

test('databank page: every item, highest tier first, with its effects at each level and as a masterwork', () => {
  const { maxLevel, items } = databankView();
  assert.equal(maxLevel, REFINE.maxLevel);
  assert.equal(items.length, ITEMS.length);
  for (let i = 1; i < items.length; i++) assert.ok(items[i - 1]!.stars >= items[i]!.stars);

  const withBonus = ITEMS.find((item) => item.bonus)!;
  const plain = ITEMS.find((item) => !item.bonus && !item.usableBy)!;
  const exclusive = ITEMS.find((item) => item.usableBy)!;
  const shown = (id: string) => items.find((item) => item.id === id)!;

  assert.equal(shown(plain.id).effects.length, REFINE.maxLevel);
  assert.deepEqual(shown(plain.id).effects[0], describeEffects(plain, 1, 1, false));
  assert.deepEqual(shown(plain.id).effects.at(-1), describeEffects(plain, 1, REFINE.maxLevel, false));
  assert.equal(shown(plain.id).masterwork, null);
  assert.equal(shown(plain.id).borrowed, null);
  assert.deepEqual(shown(withBonus.id).masterwork, describeEffects(withBonus, 1, REFINE.maxLevel, true));
  assert.ok(shown(exclusive.id).borrowed !== null && shown(exclusive.id).borrowed! < 1);
});

test('databank page: answers the site without a login, and nothing else', async () => {
  const server: Server = createServer((req, res) =>
    void handleApi(req, res, { config: SITE, clientId: () => '999', guild: () => null, memberName: async () => null, balance: async () => 0 }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const res = await fetch(`${base}/api/databank`, { headers: { Origin: SITE.origin } });
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { items: unknown[] }).items.length, ITEMS.length);
    assert.equal((await fetch(`${base}/api/databank`)).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
