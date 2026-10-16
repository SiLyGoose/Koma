import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApi, type ApiDeps } from '../src/web/api.js';
import type { WebConfig } from '../src/web/config.js';
import { DEFAULTS } from '../src/config.js';
import { RAID_CLASS_IDS, RAID_CLASSES, RAID_COMBAT, REFINE, type RaidClassId } from '../src/constants/index.js';
import { loadoutsOf } from '../src/lib/game/items/loadouts.js';
import { gearView, wornGear, type GearStore } from '../src/web/models/gear.js';
import { ITEMS_BY_ID } from '../src/data/items.js';
import { sellPrice } from '../src/lib/game/items/sell.js';
import { signSession } from '../src/web/auth/login.js';
import { signToken } from '../src/web/auth/token.js';
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
    { _id: 'd', itemId: 'c4', level: 5 },
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
  const { stats, classes, ...empty } = gearView([], null, 'x');
  // Every raid class, for the ribbon's picker, each with what it does.
  assert.deepEqual(classes.map((cls) => cls.id), [...RAID_CLASS_IDS]);
  assert.ok(classes.every((cls) => cls.name !== '' && cls.traits.length > 0));
  assert.equal(gearView([], null, 'x', undefined, null, undefined, 'knight').class, 'knight');
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
    outfit: 'tsuri',
    class: null,
  });
});

test('gear page: the Common tab shows what gear changed, beside the base', () => {
  const { stats } = gearView([{ _id: 'b', itemId: 'iron-longsword', level: 5 }], { weapon: 'b' }, 'x');
  assert.deepEqual(stats.map((s) => s.title), ['Economy', 'Robbing', 'Defense', 'Raid']);
  const changed = stats.flatMap((s) => s.rows).filter((r) => r.base !== null);
  assert.ok(changed.length > 0);
  for (const r of changed) assert.notEqual(r.value, r.base);
});

test("gear page: the Common tab's raid numbers are their class's, with rows for what only that class does", () => {
  const raid = (cls: RaidClassId | null, copies: { _id: string; itemId: string; level: number }[] = [], worn: EquipmentDoc = {}) =>
    Object.fromEntries(
      gearView(copies, worn, 'x', undefined, null, undefined, cls)
        .stats.find((s) => s.title === 'Raid')!
        .rows.map((r) => [r.label, r]),
    );
  const hp = DEFAULTS.raid.playerHp;
  const { attack, heal, support, guard } = RAID_COMBAT;
  const none = raid(null);
  assert.equal(none.HP!.value, String(hp));
  assert.equal(none.Attack!.value, String(attack.min));
  for (const label of ['Attack ramp', 'Hex', 'Strike back', 'Damage taken', 'Healing received', 'Heals can crit', 'Party heal', 'Excess healing', 'Interrupt']) assert.equal(none[label], undefined, label);
  // With nothing on, nothing is marked as changed by gear, whatever the class.
  for (const cls of RAID_CLASS_IDS) for (const r of Object.values(raid(cls))) assert.equal(r.base, null, `${cls}: ${r.label}`);

  const assassin = raid('assassin');
  assert.equal(assassin.HP!.value, String(Math.round(hp * RAID_CLASSES.assassin.hp)));
  assert.equal(assassin.Attack!.value, String(Math.round(attack.min * RAID_CLASSES.assassin.attack)));
  assert.equal(assassin['Critical Chance']!.value, `${Math.round((attack.critChance + RAID_CLASSES.assassin.crit) * 100)}%`);
  assert.equal(assassin['Damage taken']!.value, `${RAID_CLASSES.assassin.taken}x`);
  assert.equal(raid('knight')['Guard: party cut']!.value, `${RAID_CLASSES.knight.partyCut * 100}%`);
  assert.equal(none['Guard: party cut']!.value, '0%');
  assert.ok(guard.takenShare > 0);
  assert.equal(raid('priest').Heal!.value, `${Math.round(heal.amount * RAID_CLASSES.priest.heal)} HP`);
  assert.equal(raid('priest')['Heals can crit']!.value, 'Yes');
  assert.ok(raid('mechanic').Rally!.value.endsWith(`for ${support.rallyTurns + RAID_CLASSES.mechanic.rallyTurns} turns`));
  assert.equal(raid('mechanic').Interrupt!.value, `counts as ${RAID_CLASSES.mechanic.interrupts} Supports`);
  assert.equal(raid('wizard').Hex!.value, `boss's move ${RAID_CLASSES.wizard.hex * 100}% weaker`);
  assert.equal(raid('warrior')['Strike back']!.value, `${Math.round(attack.min * RAID_CLASSES.warrior.attack * RAID_CLASSES.warrior.retaliate)} damage when hit`);
  assert.equal(raid('warrior')['Healing received']!.value, `${RAID_CLASSES.warrior.healed}x`);
  assert.equal(raid('archer')['Attack ramp']!.value, `+${RAID_CLASSES.archer.rampStep * 100}% a turn, up to +${RAID_CLASSES.archer.rampMax * 100}%`);

  // A class item counts for its class (beside what that class has without it), and for nobody else.
  const staff = [{ _id: 's', itemId: 'hexweavers-staff', level: REFINE.maxLevel }];
  const hexed = raid('wizard', staff, { weapon: 's' }).Hex!;
  assert.deepEqual([hexed.value, hexed.base], [`boss's move ${Math.round((RAID_CLASSES.wizard.hex + DEFAULTS.equipment.hexBoost[4]) * 100)}% weaker`, `boss's move ${RAID_CLASSES.wizard.hex * 100}% weaker`]);
  assert.equal(raid('knight', staff, { weapon: 's' }).Hex, undefined);
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
  const calls: string[] = [];
  let picked: RaidClassId | null = null;
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
    renameLoadout: async (_guildId, _userId, number, name) => (name === 'Tank' && number !== 1 ? 'name_taken' : name === '123' ? 'name_no_letters' : 'ok'),
    refine: async (_guildId, _userId, copy, material) =>
      copy === 'x1' ? (material === 'bad' ? 'bad_material' : 'ok') : copy === 'poor' ? 'too_poor' : 'not_found',
    sell: async (_guildId, _userId, copies) => (copies.includes('x1') ? { count: copies.length, earned: 40 * copies.length } : 'nothing_to_sell'),
    lock: async (_guildId, _userId, copy) => copy === 'x1',
    setClass: async (guildId, userId, id) => {
      calls.push(`class ${guildId} ${userId} ${id}`);
      picked = id;
    },
    classes: async (_guildId, userIds) => userIds.map((id) => (id === 'u1' ? picked : id === '22' ? 'priest' : null)),
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
    const members = (await (await fetch(`${base}/api/gear/members?guild=g1`, { headers })).json()) as { members: { userId: string; name: string; copies: number; you: boolean; class: string | null }[] };
    assert.deepEqual(members.members.map((m) => [m.userId, m.name, m.copies, m.you, m.class]), [
      ['u1', 'ZEIU', 1, true, null],
      ['22', 'Mira', 7, false, 'priest'],
    ]);
    // Picking a raid class (or none), and not one that isn't a class.
    const classOf = (body: unknown) => fetch(`${base}/api/gear/class`, { method: 'POST', headers, body: JSON.stringify(body) });
    assert.equal((await classOf({ guild: 'g1', class: 'knight' })).status, 200);
    assert.equal((await classOf({ guild: 'g1', class: null })).status, 200);
    assert.equal((await classOf({ guild: 'g1', class: 'bard' })).status, 400);
    assert.equal((await classOf({ guild: 'g2', class: 'knight' })).status, 403);
    assert.deepEqual(calls.filter((call) => call.startsWith('class')), ['class g1 u1 knight', 'class g1 u1 null']);
    assert.equal((await fetch(`${base}/api/gear/members?guild=g2`, { headers })).status, 403);
    const theirs = await fetch(`${base}/api/gear?guild=g1&user=22`, { headers });
    assert.equal(theirs.status, 200);
    const peeked = (await theirs.json()) as { equipped: { weapon: string | null }; balance: number | null };
    assert.deepEqual([peeked.equipped.weapon, peeked.balance], ['y1', null]);
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

    assert.equal((await post('/api/gear/loadout/rename', '{"guild":"g1","loadout":1,"name":"Tank"}')).status, 200);
    assert.equal((await post('/api/gear/loadout/rename', '{"guild":"g1","loadout":1,"name":""}')).status, 200); // back to its default name
    const taken = await post('/api/gear/loadout/rename', '{"guild":"g1","loadout":2,"name":"Tank"}');
    assert.equal(taken.status, 409);
    assert.equal(((await taken.json()) as { error: string }).error, 'name_taken');
    assert.equal(((await (await post('/api/gear/loadout/rename', '{"guild":"g1","loadout":2,"name":"123"}')).json()) as { error: string }).error, 'name_no_letters');
    assert.equal((await post('/api/gear/loadout/rename', '{"guild":"g1","loadout":9,"name":"Tank"}')).status, 400);
    assert.equal((await post('/api/gear/loadout/rename', '{"guild":"g1","loadout":1}')).status, 400);
    assert.equal((await post('/api/gear/loadout/rename', '{"guild":"g1","loadout":1,"name":7}')).status, 400);
    assert.equal((await post('/api/gear/loadout/rename', `{"guild":"g1","loadout":1,"name":"${'a'.repeat(201)}"}`)).status, 400);

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

test('gear page: TechnoMagic gear is never refined, even with a spare: it has the one level, R1', () => {
  const copies = [
    { _id: 'old', itemId: 'tri-head-cleaver', level: 3 }, // refined back when it could be
    { _id: 'spare', itemId: 'tri-head-cleaver', level: 1 },
  ];
  const view = gearView(copies, null, 'x', undefined, 1_000_000);
  for (const copy of view.copies) {
    assert.deepEqual([copy.level, copy.maxLevel], [1, 1], copy.id);
    assert.deepEqual(copy.refine, { blocked: 'maxed', cost: null, spare: null, after: null }, copy.id);
  }
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

test('gear page: a bonus item shows its R5 bonus as an extra effect, from R5 on', () => {
  const copies = [
    { _id: 'r5', itemId: 'ruby-pickaxe', level: 5 },
    { _id: 'r4', itemId: 'ruby-pickaxe', level: 4 },
  ];
  const view = gearView(copies, null, 'x');
  const byId = Object.fromEntries(view.copies.map((c) => [c.id, c]));
  assert.equal(byId.r5!.effects.at(-1), 'Pinecraft: ores take no extra ⚡ to dig');
  assert.ok(!byId.r4!.effects.some((line) => /no extra/.test(line)));
  assert.equal(byId.r4!.refine.after?.at(-1), 'Pinecraft: ores take no extra ⚡ to dig', 'refining it to R5 says so');
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
    // Selling, refining, locking, naming loadouts and the roster stay the site's.
    for (const path of ['/api/gear/sell', '/api/gear/refine', '/api/gear/lock', '/api/gear/loadout/rename'])
      assert.equal((await post(path, { copy: 'y1', copies: ['y1'], loadout: 1, name: 'Tank' })).status, 401);
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
  );
  const worn = wornGear(view);
  assert.deepEqual(worn.copies.map((c) => c.id).sort(), ['a', 'b']);
  assert.deepEqual(worn.loadouts.map((l) => l.active), [true]);
  assert.equal(worn.balance, null);
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
