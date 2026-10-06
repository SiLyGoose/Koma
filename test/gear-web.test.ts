import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApi, type ApiDeps } from '../src/web/api.js';
import type { WebConfig } from '../src/web/config.js';
import { DEFAULTS } from '../src/config.js';
import { REFINE } from '../src/constants/index.js';
import { loadoutsOf } from '../src/lib/game/items/loadouts.js';
import { gearView, wornGear, type GearStore } from '../src/web/gear.js';
import { ITEMS_BY_ID } from '../src/data/items.js';
import { sellPrice } from '../src/lib/game/items/sell.js';
import { signSession } from '../src/web/login.js';
import { signToken } from '../src/web/token.js';
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
    balance: null,
    gems: null,
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
    peek: async (_guildId, userId) => gearView([{ _id: 'y1', itemId: 'iron-longsword', level: 2 }], { weapon: 'y1' }, userId),
    owners: async () => [
      { userId: '22', copies: 7 },
      { userId: 'u1', copies: 1 },
      { userId: '33', copies: 3 }, // left the server
    ],
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
    refine: async (_guildId, _userId, copy, material) =>
      copy === 'x1' ? (material === 'bad' ? 'bad_material' : 'ok') : copy === 'poor' ? 'too_poor' : 'not_found',
    forge: async (_guildId, _userId, copy) => (copy === 'x1' ? 'ok' : copy === 'low' ? 'too_low' : copy === 'done' ? 'forged' : 'not_found'),
    sell: async (_guildId, _userId, copies) => (copies.includes('x1') ? { count: copies.length, earned: 40 * copies.length } : 'nothing_to_sell'),
    lock: async (_guildId, _userId, copy) => copy === 'x1',
  };
  const deps: ApiDeps = {
    config: SITE,
    clientId: () => '999',
    guild: (id) => (id === 'g1' || id === 'g2' ? { name: id, icon: null } : null),
    memberName: async (guildId, userId) => (guildId !== 'g1' ? null : userId === 'u1' ? 'ZEIU' : userId === '22' ? 'Mira' : null),
    balance: async () => 0,
    gear: store,
  };
  const session = signSession({ userId: 'u1', name: 'ZEIU', avatar: null, guildIds: ['g1', 'g2'] }, 'shh');
  const headers = { Origin: SITE.origin, 'Content-Type': 'application/json', Authorization: `Bearer ${session}` };

  const server: Server = createServer(createApi(deps));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const get = await fetch(`${base}/api/gear?guild=g1`, { headers });
    assert.equal(get.status, 200);
    assert.equal(((await get.json()) as { equipped: { weapon: string | null } }).equipped.weapon, null);
    assert.equal((await fetch(`${base}/api/gear?guild=g2`, { headers })).status, 403); // left that server
    assert.equal((await fetch(`${base}/api/gear?guild=g3`, { headers })).status, 403);
    assert.equal((await fetch(`${base}/api/gear?guild=g1`, { headers: { Origin: SITE.origin } })).status, 401);

    // Anyone else in the server with gear, to look at: the one asking first, and not whoever left.
    const members = (await (await fetch(`${base}/api/gear/members?guild=g1`, { headers })).json()) as { members: { userId: string; name: string; copies: number; you: boolean }[] };
    assert.deepEqual(members.members.map((m) => [m.userId, m.name, m.copies, m.you]), [
      ['u1', 'ZEIU', 1, true],
      ['22', 'Mira', 7, false],
    ]);
    assert.equal((await fetch(`${base}/api/gear/members?guild=g2`, { headers })).status, 403);
    const theirs = await fetch(`${base}/api/gear?guild=g1&user=22`, { headers });
    assert.equal(theirs.status, 200);
    const peeked = (await theirs.json()) as { equipped: { weapon: string | null }; balance: number | null; gems: number | null };
    assert.deepEqual([peeked.equipped.weapon, peeked.balance, peeked.gems], ['y1', null, null]);
    assert.equal((await fetch(`${base}/api/gear?guild=g1&user=33`, { headers })).status, 404); // left the server
    assert.equal((await fetch(`${base}/api/gear?guild=g1&user=nope`, { headers })).status, 404);
    assert.equal(((await (await fetch(`${base}/api/gear?guild=g1&user=u1`, { headers })).json()) as { copies: { id: string }[] }).copies[0]!.id, 'x1'); // their own

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

    assert.equal((await post('/api/gear/refine', '{"guild":"g1","copy":"x1"}')).status, 200);
    assert.equal((await post('/api/gear/refine', '{"guild":"g1","copy":"x1","material":"x2"}')).status, 200);
    const bad = await post('/api/gear/refine', '{"guild":"g1","copy":"x1","material":"bad"}');
    assert.equal(bad.status, 409);
    assert.equal(((await bad.json()) as { error: string }).error, 'bad_material');
    assert.equal((await post('/api/gear/refine', '{"guild":"g1","copy":"x1","material":7}')).status, 400);
    const poor = await post('/api/gear/refine', '{"guild":"g1","copy":"poor"}');
    assert.equal(poor.status, 409);
    assert.equal(((await poor.json()) as { error: string }).error, 'too_poor');
    assert.equal((await post('/api/gear/refine', '{"guild":"g1","copy":"nope"}')).status, 404);
    assert.equal((await post('/api/gear/refine', '{"guild":"g1"}')).status, 400);

    assert.equal((await post('/api/gear/forge', '{"guild":"g1","copy":"x1"}')).status, 200);
    const low = await post('/api/gear/forge', '{"guild":"g1","copy":"low"}');
    assert.equal(low.status, 409);
    assert.equal(((await low.json()) as { error: string }).error, 'too_low');
    assert.equal(((await (await post('/api/gear/forge', '{"guild":"g1","copy":"done"}')).json()) as { error: string }).error, 'forged');
    assert.equal((await post('/api/gear/forge', '{"guild":"g1","copy":"nope"}')).status, 404);
    assert.equal((await post('/api/gear/forge', '{"guild":"g1"}')).status, 400);

    const sale = await post('/api/gear/sell', '{"guild":"g1","copies":["x1","x2","x2"]}');
    assert.equal(sale.status, 200);
    assert.deepEqual(((await sale.json()) as { sold: unknown }).sold, { count: 2, earned: 80 }); // the same copy twice counts once
    const none = await post('/api/gear/sell', '{"guild":"g1","copies":["nope"]}');
    assert.equal(none.status, 409);
    assert.equal(((await none.json()) as { error: string }).error, 'nothing_to_sell');
    assert.equal((await post('/api/gear/sell', '{"guild":"g1","copies":[]}')).status, 400);
    assert.equal((await post('/api/gear/sell', '{"guild":"g1","copies":"x1"}')).status, 400);
    assert.equal((await post('/api/gear/sell', '{"guild":"g1","copies":[7]}')).status, 400);

    assert.equal((await post('/api/gear/lock', '{"guild":"g1","copy":"x1","locked":true}')).status, 200);
    assert.equal((await post('/api/gear/lock', '{"guild":"g1","copy":"x1","locked":false}')).status, 200);
    assert.equal((await post('/api/gear/lock', '{"guild":"g1","copy":"nope","locked":true}')).status, 404);
    assert.equal((await post('/api/gear/lock', '{"guild":"g1","copy":"x1"}')).status, 400);
    assert.equal((await post('/api/gear/lock', '{"guild":"g1","copy":"x1","locked":"yes"}')).status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('gear page: each copy says whether it can be refined, and what the next level costs', () => {
  const copies = [
    { _id: 'worn', itemId: 'rusty-dagger', level: 2 },
    { _id: 'spare', itemId: 'rusty-dagger', level: 1 },
    { _id: 'lone', itemId: 'wooden-shield', level: 1 },
    { _id: 'top', itemId: 'iron-longsword', level: 5 },
    { _id: 'top-spare', itemId: 'iron-longsword', level: 1 },
  ];
  const refine = (balance: number | null) =>
    Object.fromEntries(gearView(copies, { weapon: 'worn' }, 'x', undefined, balance).copies.map((c) => [c.id, c.refine.blocked]));

  // Every copy is refined as itself: the worn dagger can use up the spare, but the spare has nothing to
  // use up (the worn one never is); the spare longsword can use up the R5 one, which is in no loadout.
  assert.deepEqual(refine(1_000_000), { worn: null, spare: 'no_duplicate', lone: 'no_duplicate', top: 'maxed', 'top-spare': null });
  assert.equal(refine(0).worn, 'too_poor');
  assert.equal(refine(null).worn, null); // points not known: not held back

  const view = gearView(copies, { weapon: 'worn' }, 'x', undefined, 500);
  assert.equal(view.balance, 500);
  const worn = view.copies.find((c) => c.id === 'worn')!.refine;
  assert.ok((worn.cost ?? 0) > 0);
  assert.equal(worn.spare, 1); // the spare R1 dagger is used up
  assert.ok(worn.after !== null && worn.after.length > 0);
  assert.notDeepEqual(worn.after, view.copies.find((c) => c.id === 'worn')!.effects); // stronger at R3
  const top = view.copies.find((c) => c.id === 'top')!.refine;
  assert.deepEqual([top.cost, top.spare, top.after], [null, null, null]);
  assert.equal(view.copies.find((c) => c.id === 'lone')!.refine.spare, null);
});

test('gear page: each copy says what it sells for, unless it is worn or saved in a loadout', () => {
  const copies = [
    { _id: 'worn', itemId: 'rusty-dagger', level: 1 },
    { _id: 'saved', itemId: 'rusty-dagger', level: 1 },
    { _id: 'spare', itemId: 'rusty-dagger', level: 1 },
  ];
  const loadouts = [
    { number: 1, name: 'Loadout 1', active: true, equipment: { weapon: 'worn' } },
    { number: 2, name: 'Loadout 2', active: false, equipment: { weapon: 'saved' } },
  ];
  const sell = Object.fromEntries(gearView(copies, { weapon: 'worn' }, 'x', loadouts).copies.map((c) => [c.id, c.sell]));
  assert.deepEqual(sell, { worn: null, saved: null, spare: sellPrice(ITEMS_BY_ID.get('rusty-dagger')!.stars) });
});

test('gear page: a locked copy is shown locked, never sells, and is never a spare for a refine', () => {
  const copies = [
    { _id: 'worn', itemId: 'rusty-dagger', level: 2 },
    { _id: 'locked', itemId: 'rusty-dagger', level: 1, locked: true },
  ];
  const view = gearView(copies, { weapon: 'worn' }, 'x', undefined, 1_000_000);
  const byId = Object.fromEntries(view.copies.map((c) => [c.id, c]));
  assert.deepEqual([byId.locked!.locked, byId.worn!.locked], [true, false]);
  assert.equal(byId.locked!.sell, null);
  assert.equal(byId.worn!.refine.blocked, 'no_duplicate');
});

test('gear page: each copy of a bonus item says whether it can be forged into a masterwork, and for how many komaGems', () => {
  const copies = [
    { _id: 'r5', itemId: 'ruby-pickaxe', level: 5 },
    { _id: 'r3', itemId: 'ruby-pickaxe', level: 3 },
    { _id: 'mw', itemId: 'ruby-pickaxe', level: 5, masterwork: true },
    { _id: 'plain', itemId: 'rusty-dagger', level: 5 },
  ];
  const forge = (gems: number | null) =>
    Object.fromEntries(gearView(copies, null, 'x', undefined, null, gems).copies.map((c) => [c.id, c.forge === null ? 'none' : c.forge.blocked]));

  assert.deepEqual(forge(1_000_000), { r5: null, r3: 'too_low', mw: 'forged', plain: 'none' });
  assert.equal(forge(0).r5, 'too_poor');
  assert.equal(forge(null).r5, null); // gems not known: not held back

  const view = gearView(copies, null, 'x', undefined, null, 40);
  assert.equal(view.gems, 40);
  const r5 = view.copies.find((c) => c.id === 'r5')!;
  assert.deepEqual([r5.forge?.cost, r5.forge?.level], [DEFAULTS.refine.masterworkGems, REFINE.maxLevel]);
  assert.ok(r5.forge?.after && !r5.forge.after.some((line) => line.startsWith('🔒')), 'once forged the bonus is on');
  assert.ok(r5.effects.some((line) => line.startsWith('🔒')), 'not forged yet: the bonus is locked');
  assert.equal(view.copies.find((c) => c.id === 'mw')!.forge?.after, null);
  assert.equal(view.copies.find((c) => c.id === 'plain')!.forge, null);
});

test("gear page: a game's link can look at gear in its server (the raid's party), and change only what its own member wears", async () => {
  const asked: string[] = [];
  const view = (userId: string): ReturnType<typeof gearView> => gearView([{ _id: 'y1', itemId: 'iron-longsword', level: 2 }], { weapon: 'y1' }, userId);
  const store = {
    view: async (guildId: string, userId: string) => (asked.push(`view ${guildId} ${userId}`), view(userId)),
    peek: async (guildId: string, userId: string) => (asked.push(`peek ${guildId} ${userId}`), view(userId)),
    equip: async (guildId: string, userId: string, copy: string) => (asked.push(`equip ${guildId} ${userId} ${copy}`), true),
    switchLoadout: async (guildId: string, userId: string, number: number) => (asked.push(`loadout ${guildId} ${userId} ${number}`), true),
  } as unknown as GearStore;
  const deps: ApiDeps = {
    config: SITE,
    clientId: () => '999',
    guild: (id) => (id === 'g1' || id === 'g2' ? { name: id, icon: null } : null),
    memberName: async (guildId, userId) => (guildId === 'g1' && (userId === '11' || userId === '22') ? `Name ${userId}` : null),
    balance: async () => 0,
    gear: store,
  };
  const token = signToken({ guildId: 'g1', userId: '11', name: 'Name 11' }, 60_000);
  const headers = { Origin: SITE.origin, Authorization: `Game ${token}` };
  const post = (path: string, body: unknown): Promise<Response> =>
    fetch(`${base}${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const server: Server = createServer(createApi(deps));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const mine = await fetch(`${base}/api/gear`, { headers });
    assert.equal(mine.status, 200);
    assert.equal(((await mine.json()) as { equipped: { weapon: string | null } }).equipped.weapon, 'y1');
    assert.equal((await fetch(`${base}/api/gear?user=22`, { headers })).status, 200);
    assert.equal((await fetch(`${base}/api/gear?user=33`, { headers })).status, 404); // not in the server
    assert.equal((await fetch(`${base}/api/gear?user=22`, { headers: { Origin: SITE.origin, Authorization: 'Game nonsense' } })).status, 401);
    // Their own gear changes, always in the link's server (whatever server the body names).
    assert.equal((await post('/api/gear/equip', { guild: 'g2', copy: 'y1' })).status, 200);
    assert.equal((await post('/api/gear/loadout', { loadout: 2 })).status, 200);
    assert.deepEqual(asked, ['view g1 11', 'peek g1 22', 'equip g1 11 y1', 'view g1 11', 'loadout g1 11 2', 'view g1 11']);
    // Selling, refining, forging, locking and the roster stay the site's.
    for (const path of ['/api/gear/sell', '/api/gear/refine', '/api/gear/forge', '/api/gear/lock']) assert.equal((await post(path, { copy: 'y1', copies: ['y1'] })).status, 401);
    assert.equal((await fetch(`${base}/api/gear/members?guild=g1`, { headers })).status, 401);
  } finally {
    server.close();
  }
});

test('a raider\'s gear as they fought: only what they wore, in the loadout they wore it in, and no money', () => {
  const view = gearView(
    [
      { _id: 'a', itemId: 'rusty-dagger', level: 1 },
      { _id: 'b', itemId: 'wooden-shield', level: 2 },
      { _id: 'c', itemId: 'iron-longsword', level: 3 },
    ],
    { weapon: 'a', armor: 'b' },
    'x',
    undefined,
    500,
    7,
  );
  const worn = wornGear(view);
  assert.deepEqual(worn.copies.map((c) => c.id).sort(), ['a', 'b']);
  assert.deepEqual(worn.loadouts.map((l) => l.active), [true]);
  assert.equal(worn.balance, null);
  assert.equal(worn.gems, null);
  assert.deepEqual(worn.totals, view.totals);
});

test("the raid's end screen can look at a raider's gear as they fought, with the raid's link only", async () => {
  const deps: ApiDeps = {
    config: SITE,
    clientId: () => '999',
    guild: (id) => (id === 'g1' ? { name: id, icon: null } : null),
    memberName: async () => 'x',
    balance: async () => 0,
    raid: { start: async () => ({ ok: true }), week: async () => { throw new Error('unused'); }, gear: async (_g, userId) => (userId === '22' ? { kept: userId } : null) },
  };
  const headers = { Origin: SITE.origin, Authorization: `Game ${signToken({ guildId: 'g1', userId: '11', name: 'A' }, 60_000)}` };
  const server: Server = createServer(createApi(deps));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const kept = await fetch(`${base}/api/raid/gear?user=22`, { headers });
    assert.equal(kept.status, 200);
    assert.deepEqual(await kept.json(), { kept: '22' });
    assert.equal((await fetch(`${base}/api/raid/gear?user=33`, { headers })).status, 404);
    assert.equal((await fetch(`${base}/api/raid/gear?user=22`, { headers: { Origin: SITE.origin } })).status, 401);
  } finally {
    server.close();
  }
});
