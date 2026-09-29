import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { handleApi, type ApiDeps } from '../src/web/api.js';
import type { WebConfig } from '../src/web/config.js';
import { loadoutsOf } from '../src/lib/game/items/loadouts.js';
import { gearView, type GearStore } from '../src/web/gear.js';
import { signSession } from '../src/web/login.js';
import type { EquipmentDoc, Slot } from '../src/types.js';

const SITE: WebConfig = {
  siteUrl: 'https://koma-ui.vercel.app',
  origin: 'https://koma-ui.vercel.app',
  apiUrl: 'https://koma.duckdns.org',
  socketUrl: 'wss://koma.duckdns.org',
  port: 0,
  clientSecret: 'shh',
};

test('gear page: copies come best first, with what each does, and only fitting copies count as worn', () => {
  const copies = [
    { _id: 'a', itemId: 'rusty-dagger', level: 1 },
    { _id: 'b', itemId: 'iron-longsword', level: 3 },
    { _id: 'c', itemId: 'wooden-shield', level: 0 },
    { _id: 'd', itemId: 'c4', level: 5, masterwork: true },
    { _id: 'e', itemId: 'not-an-item', level: 1 },
  ];
  const view = gearView(copies, { weapon: 'b', armor: 'a', treasure: 'gone' }, 'someone');
  assert.deepEqual(view.copies.map((c) => c.id), ['d', 'b', 'a', 'c']);
  assert.deepEqual(view.equipped, { weapon: 'b', armor: null, treasure: null }); // a dagger isn't armor
  const shield = view.copies.find((c) => c.id === 'c')!;
  assert.equal(shield.level, 1); // an old copy at 0 counts as 1
  assert.equal(shield.slot, 'armor');
  assert.ok(shield.effects.length > 0);
  // C4 is someone else's: its effects come at part strength.
  assert.ok(view.copies[0]!.borrowed !== null && view.copies[0]!.borrowed < 1);
  assert.equal(view.copies.find((c) => c.id === 'b')!.borrowed, null);
  assert.ok(view.totals.length > 0);
  const none = { weapon: null, armor: null, treasure: null };
  const { stats, ...empty } = gearView([], null, 'x');
  // With nothing on, every stat is its base.
  assert.ok(stats.every((section) => section.rows.every((r) => r.base === null)));
  assert.deepEqual(empty, {
    equipped: none,
    copies: [],
    totals: [],
    loadouts: [
      { number: 1, name: 'Loadout 1', active: true, equipped: none },
      { number: 2, name: 'Loadout 2', active: false, equipped: none },
      { number: 3, name: 'Loadout 3', active: false, equipped: none },
    ],
  });
});

test('gear page: the Common tab shows what gear changed, beside the base', () => {
  const { stats } = gearView([{ _id: 'b', itemId: 'iron-longsword', level: 5 }], { weapon: 'b' }, 'x');
  assert.deepEqual(stats.map((s) => s.title), ['Economy', 'Robbing', 'Defense', 'Raid']);
  const changed = stats.flatMap((s) => s.rows).filter((r) => r.base !== null);
  assert.ok(changed.length > 0);
  for (const r of changed) assert.notEqual(r.value, r.base);
});

test('gear page: every loadout lists the owned copies that fit its slots', () => {
  const copies = [
    { _id: 'a', itemId: 'rusty-dagger', level: 1 },
    { _id: 'b', itemId: 'wooden-shield', level: 1 },
  ];
  const member = { equipment: { weapon: 'a' }, activeLoadout: 2, loadouts: { '1': { name: 'Tank', equipment: { weapon: 'b', armor: 'b' } } } };
  const view = gearView(copies, member.equipment, 'x', loadoutsOf(member));
  assert.deepEqual(
    view.loadouts.map((l) => [l.number, l.name, l.active, l.equipped]),
    [
      [1, 'Tank', false, { weapon: null, armor: 'b', treasure: null }], // a shield isn't a weapon
      [2, 'Loadout 2', true, { weapon: 'a', armor: null, treasure: null }],
      [3, 'Loadout 3', false, { weapon: null, armor: null, treasure: null }],
    ],
  );
});

test('gear page: a logged-in member sees, equips and unequips their gear in their own servers only', async () => {
  const worn: Record<string, EquipmentDoc> = {};
  const store: GearStore = {
    view: async (guildId, userId) => gearView([{ _id: 'x1', itemId: 'rusty-dagger', level: 1 }], worn[`${guildId}/${userId}`], userId),
    equip: async (guildId, userId, copy) => {
      if (copy !== 'x1') return false;
      worn[`${guildId}/${userId}`] = { weapon: copy };
      return true;
    },
    unequip: async (guildId, userId, slot: Slot) => {
      worn[`${guildId}/${userId}`] = { ...worn[`${guildId}/${userId}`], [slot]: null };
    },
    unequipAll: async (guildId, userId) => {
      worn[`${guildId}/${userId}`] = {};
    },
    switchLoadout: async (_guildId, _userId, number) => number !== 3, // 3 is always busy here
  };
  const deps: ApiDeps = {
    config: SITE,
    clientId: () => '999',
    guild: (id) => (id === 'g1' || id === 'g2' ? { name: id, icon: null } : null),
    memberName: async (guildId) => (guildId === 'g1' ? 'ZEIU' : null),
    balance: async () => 0,
    gear: store,
  };
  const session = signSession({ userId: 'u1', name: 'ZEIU', avatar: null, guildIds: ['g1', 'g2'] }, 'shh');
  const headers = { Origin: SITE.origin, 'Content-Type': 'application/json', Authorization: `Bearer ${session}` };

  const server: Server = createServer((req, res) => void handleApi(req, res, deps));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const get = await fetch(`${base}/api/gear?guild=g1`, { headers });
    assert.equal(get.status, 200);
    assert.equal(((await get.json()) as { equipped: { weapon: string | null } }).equipped.weapon, null);
    assert.equal((await fetch(`${base}/api/gear?guild=g2`, { headers })).status, 403); // left that server
    assert.equal((await fetch(`${base}/api/gear?guild=g3`, { headers })).status, 403);
    assert.equal((await fetch(`${base}/api/gear?guild=g1`, { headers: { Origin: SITE.origin } })).status, 401);

    const equip = await fetch(`${base}/api/gear/equip`, { method: 'POST', headers, body: '{"guild":"g1","copy":"x1"}' });
    assert.equal(((await equip.json()) as { equipped: { weapon: string | null } }).equipped.weapon, 'x1');
    assert.equal((await fetch(`${base}/api/gear/equip`, { method: 'POST', headers, body: '{"guild":"g1","copy":"nope"}' })).status, 404);

    assert.equal((await fetch(`${base}/api/gear/unequip`, { method: 'POST', headers, body: '{"guild":"g1","slot":"boots"}' })).status, 400);
    const unequip = await fetch(`${base}/api/gear/unequip`, { method: 'POST', headers, body: '{"guild":"g1","slot":"weapon"}' });
    assert.equal(((await unequip.json()) as { equipped: { weapon: string | null } }).equipped.weapon, null);

    await fetch(`${base}/api/gear/equip`, { method: 'POST', headers, body: '{"guild":"g1","copy":"x1"}' });
    const all = await fetch(`${base}/api/gear/unequip-all`, { method: 'POST', headers, body: '{"guild":"g1"}' });
    assert.equal(((await all.json()) as { equipped: { weapon: string | null } }).equipped.weapon, null);

    const post = (path: string, body: string) => fetch(`${base}${path}`, { method: 'POST', headers, body });
    assert.equal((await post('/api/gear/loadout', '{"guild":"g1","loadout":2}')).status, 200);
    assert.equal((await post('/api/gear/loadout', '{"guild":"g1","loadout":3}')).status, 409);
    assert.equal((await post('/api/gear/loadout', '{"guild":"g1","loadout":9}')).status, 400);
    assert.equal((await post('/api/gear/loadout', '{"guild":"g1","loadout":"2"}')).status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
