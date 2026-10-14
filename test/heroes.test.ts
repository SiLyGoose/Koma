import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { GROUPS } from '../src/commands/config.js';
import { DEFAULTS } from '../src/config.js';
import { gachaItems, ITEMS, ITEMS_BY_ID, TM_DROPS, tmDropsOf, validateItems } from '../src/data/items.js';
import { HEROES, HEROES_BY_ID } from '../src/data/heroes.js';
import { RAID_CLASS_IDS } from '../src/constants/index.js';
import { activeSet, heroBonus, heroCopyIds, heroSet, raidGear, setLines, heroEquipMoves, heroItemLines, heroOnly, heroSlotsFor, heroWearable, heroWorn, raidValue } from '../src/lib/game/heroes.js';
import { effectStrength } from '../src/lib/game/items/equipment.js';
import { keptCopyIds } from '../src/lib/game/items/loadouts.js';
import { findSpec, validateSettings } from '../src/lib/settings-spec.js';
import { createApi, type ApiDeps } from '../src/web/api.js';
import { signSession } from '../src/web/auth/login.js';
import type { WebConfig } from '../src/web/config.js';
import { heroesView, type HeroesView, type HeroStore } from '../src/web/models/heroes.js';
import type { MemberDoc } from '../src/types.js';

const SITE: WebConfig = {
  siteUrl: 'https://koma-ui.vercel.app',
  origin: 'https://koma-ui.vercel.app',
  apiUrl: 'https://koma.duckdns.org',
  socketUrl: 'wss://koma.duckdns.org',
  port: 0,
  clientSecret: 'shh',
};

const item = (id: string) => ITEMS_BY_ID.get(id)!;

test('heroes: Kirze, Clause and Fallen Frey, each once, each of a raid class; their price is a setting of its own', () => {
  assert.deepEqual(
    HEROES.map((hero) => [hero.id, hero.class]),
    [
      ['kirze', 'warrior'],
      ['clause', 'knight'],
      ['fallen-frey', 'priest'],
    ],
  );
  assert.equal(HEROES_BY_ID.size, HEROES.length);
  for (const hero of HEROES) assert.ok(RAID_CLASS_IDS.includes(hero.class));
  assert.equal(DEFAULTS.hero.price, 25_000);
  assert.equal(findSpec('hero.price')?.group, 'Hero');
  assert.ok(GROUPS.includes('Hero'));
  assert.deepEqual(validateSettings(structuredClone(DEFAULTS)), []);
});

test('TechnoMagic gear: a tier of its own (counted as 4-star), never pulled, heroes only, with only the TechnoMagic perks, each piece in a set', () => {
  assert.doesNotThrow(validateItems);
  assert.ok(TM_DROPS.length > 0);
  for (const gear of TM_DROPS) {
    assert.equal(gear.stars, 4, gear.id);
    assert.ok(gear.tmSet, gear.id);
    assert.ok(heroOnly(gear) && heroWearable(gear), gear.id);
    assert.ok(gear.effects.every((effect) => effect.startsWith('tm')), gear.id);
    assert.ok(!gachaItems(gear.stars).includes(gear), gear.id);
  }
  assert.ok(TM_DROPS.some((gear) => gear.slot === 'treasure'), 'a treasure');
  // Galgoria drops Perseverance only: a weapon and an armor of it for every hero's class, so any hero can wear all four pieces.
  for (const hero of HEROES) {
    for (const slot of ['weapon', 'armor'] as const) assert.ok(tmDropsOf('perseverance').some((gear) => gear.slot === slot && gear.class === hero.class), `${hero.class} ${slot}`);
  }
  // The raid's gear goes on heroes too (and on members); the gacha's doesn't go on heroes.
  assert.ok(heroWearable(item('worldbreaker-maul')) && !heroOnly(item('worldbreaker-maul')));
  assert.ok(ITEMS.filter((one) => !one.raidDrop && !one.tmDrop).every((one) => !heroWearable(one)));
});

test('heroes: two weapon slots, two armor slots and a treasure slot', () => {
  assert.deepEqual(heroSlotsFor(item('worldbreaker-maul')), ['weapon1', 'weapon2']);
  assert.deepEqual(heroSlotsFor(item('colossus-plate')), ['armor1', 'armor2']);
  assert.deepEqual(heroSlotsFor(item('galgorias-heart')), ['treasure']);
});

test('heroes: what they wear is kept from selling and refining, and a copy moves off any other hero it was on', () => {
  const member: Pick<MemberDoc, 'heroes' | 'equipment'> = {
    equipment: { weapon: 'w' },
    heroes: {
      kirze: { boughtAt: new Date(0), equipment: { weapon1: 'a', weapon2: 'b', armor1: null } },
      clause: { boughtAt: new Date(0), equipment: { armor2: 'c' } },
    },
  };
  assert.deepEqual([...heroWorn(member)], [
    ['a', 'kirze'],
    ['b', 'kirze'],
    ['c', 'clause'],
  ]);
  assert.deepEqual([...heroCopyIds(member)].sort(), ['a', 'b', 'c']);
  assert.deepEqual([...keptCopyIds(member)].sort(), ['a', 'b', 'c', 'w']);
  assert.deepEqual(heroCopyIds(null), new Set());

  // Copy a onto Clause: it comes off Kirze's first weapon slot, and must not be anywhere else meanwhile.
  const moves = heroEquipMoves(member.heroes, 'clause', 'weapon1', 'a');
  assert.deepEqual(moves.from, ['heroes.kirze.equipment.weapon1']);
  assert.ok(moves.elsewhere.includes('heroes.kirze.equipment.weapon2') && moves.elsewhere.includes('heroes.clause.equipment.weapon2'));
  assert.ok(!moves.elsewhere.includes('heroes.clause.equipment.weapon1'));
  // From one of Kirze's weapon slots to the other.
  assert.deepEqual(heroEquipMoves(member.heroes, 'kirze', 'weapon2', 'a').from, ['heroes.kirze.equipment.weapon1']);
});

test('heroes: gear raises their stats, the raid gear by what it does in the raid, and a class item only on its class', () => {
  const fang = { item: item('tri-head-cleaver'), level: 5 };
  const maul = { item: item('worldbreaker-maul'), level: 5 };
  const axe = { item: item('warlords-greataxe'), level: 5 };
  const kirze = heroBonus([fang, maul, axe], 'warrior');
  assert.ok(Math.abs(kirze.atk - (effectStrength('tmAttack', 4) + effectStrength('raidAttack', 4))) < 1e-9);
  assert.ok(Math.abs(kirze.critDamage - effectStrength('tmCritDamage', 4)) < 1e-9);
  assert.ok(kirze.block > 0); // the Warlord's Greataxe, on a warrior
  assert.equal(heroBonus([axe], 'knight').block, 0); // not on a knight
  assert.equal(raidValue('crit', 0.08), 80); // points in the raid
  assert.equal(raidValue('atk', 0.25), 0.25); // a share more
  // Less refined, less of it.
  assert.ok(heroBonus([{ ...fang, level: 1 }], 'warrior').atk < heroBonus([fang], 'warrior').atk);
  assert.equal(heroItemLines(item('tri-head-cleaver'))[0], `+${Math.round(effectStrength('tmAttack', 4) * 100)}% ATK`);
});

test('heroes view: every hero, the copies a hero can wear, and what each of theirs wears and gets from it', () => {
  const copies = [
    { _id: 'fang', itemId: 'tri-head-cleaver', level: 5 },
    { _id: 'maul', itemId: 'worldbreaker-maul', level: 2, locked: true },
    { _id: 'dagger', itemId: 'rusty-dagger', level: 1 }, // the gacha's: no hero wears it
    { _id: 'plate', itemId: 'colossus-plate', level: 1 },
  ];
  const member = {
    points: 30_000,
    heroes: {
      kirze: { boughtAt: new Date(0), equipment: { weapon1: 'fang', weapon2: 'maul', armor1: 'gone', treasure: 'plate' } },
    },
  };
  const view = heroesView(copies, member);
  assert.equal(view.balance, 30_000);
  assert.deepEqual(view.copies.map((copy) => copy.id), ['fang', 'maul', 'plate']); // TechnoMagic gear first, then by stars, then level
  assert.equal(view.copies.find((copy) => copy.id === 'maul')?.hero, 'kirze');
  assert.equal(view.copies.find((copy) => copy.id === 'maul')?.locked, true);
  const [kirze, clause] = view.heroes;
  assert.equal(kirze?.owned, true);
  assert.equal(clause?.owned, false);
  assert.equal(kirze?.price, DEFAULTS.hero.price);
  // A copy they no longer own, or in a slot it doesn't fit, isn't worn.
  assert.deepEqual(kirze?.equipped, { weapon1: 'fang', weapon2: 'maul', armor1: null, armor2: null, treasure: null });
  assert.ok((kirze?.bonus.atk ?? 0) > effectStrength('tmAttack', 4));
  assert.ok(Math.abs((kirze?.bonus.critDamage ?? 0) - effectStrength('tmCritDamage', 4)) < 1e-9);
  assert.deepEqual(kirze?.set, { id: 'perseverance', pieces: 1, active: false });
  assert.ok(kirze?.totals.some((line) => line.includes('Perseverance set: 1/4')));
  assert.ok(kirze?.totals.some((line) => line.endsWith('ATK')));
  assert.deepEqual(clause?.totals, []);
});

test('heroes web: a logged-in member sees the heroes, buys one and gears it, in their own servers only', async () => {
  const empty: HeroesView = { heroes: [], copies: [], balance: 0 };
  let owned: string[] = [];
  const calls: string[] = [];
  const store: HeroStore = {
    view: async (guildId, userId) => ({ ...empty, heroes: (userId === '22' ? ['clause'] : owned).map((id) => ({ id }) as never), balance: 500 }),
    // 22 has a hero; 33 more, but has left the server.
    owners: async () => [
      { userId: '33', heroes: 3 },
      { userId: '22', heroes: 1 },
    ],
    buy: async (guildId, userId, id) => {
      calls.push(`buy ${guildId} ${userId} ${id}`);
      if (!HEROES_BY_ID.has(id)) return 'not_found';
      if (owned.includes(id)) return 'owned';
      owned = [...owned, id];
      return { ...empty, heroes: owned.map((one) => ({ id: one }) as never) };
    },
    equip: async (guildId, userId, hero, slot, copy) => {
      calls.push(`equip ${hero} ${slot} ${copy}`);
      if (!owned.includes(hero)) return 'not_found';
      if (slot === 'treasure') return 'wrong_slot';
      return empty;
    },
    unequip: async (guildId, userId, hero, slot) => {
      calls.push(`unequip ${hero} ${slot}`);
      return owned.includes(hero) ? empty : 'not_found';
    },
  };
  const deps: ApiDeps = {
    config: SITE,
    clientId: () => '999',
    guild: (id) => (id === 'g1' || id === 'g2' ? { name: id, icon: null } : null),
    memberName: async (guildId, userId) => (guildId === 'g1' && userId === 'u1' ? 'ZEIU' : guildId === 'g1' && userId === '22' ? 'Pine' : null),
    balance: async () => 0,
    heroes: store,
  };
  const session = signSession({ userId: 'u1', name: 'ZEIU', avatar: null, guildIds: ['g1', 'g2'] }, 'shh');
  const headers = { Origin: SITE.origin, 'Content-Type': 'application/json', Authorization: `Bearer ${session}` };
  const server: Server = createServer(createApi(deps));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(`${base}/api/heroes?guild=g1`, { headers })).status, 200);
    assert.equal((await fetch(`${base}/api/heroes?guild=g2`, { headers })).status, 403);
    assert.equal((await fetch(`${base}/api/heroes?guild=g1`, { headers: { Origin: SITE.origin } })).status, 401);

    // Who else has heroes: them first (with none yet), not whoever left; and another's heroes to look at, without their points.
    const members = (await (await fetch(`${base}/api/heroes/members?guild=g1`, { headers })).json()) as { members: { userId: string; name: string; heroes: number; you: boolean }[] };
    assert.deepEqual(
      members.members.map(({ userId, name, heroes, you }) => ({ userId, name, heroes, you })),
      [
        { userId: 'u1', name: 'ZEIU', heroes: 0, you: true },
        { userId: '22', name: 'Pine', heroes: 1, you: false },
      ],
    );
    assert.equal((await fetch(`${base}/api/heroes/members?guild=g2`, { headers })).status, 403);
    const theirs = (await (await fetch(`${base}/api/heroes?guild=g1&user=22`, { headers })).json()) as HeroesView;
    assert.deepEqual([theirs.heroes.map((hero) => hero.id), theirs.balance], [['clause'], 0]);
    assert.equal((await fetch(`${base}/api/heroes?guild=g1&user=33`, { headers })).status, 404); // left the server
    assert.equal((await fetch(`${base}/api/heroes?guild=g1&user=nope`, { headers })).status, 404);
    assert.equal(((await (await fetch(`${base}/api/heroes?guild=g1&user=u1`, { headers })).json()) as HeroesView).balance, 500); // their own

    // Not theirs to gear yet.
    assert.deepEqual(await (await post('/api/heroes/equip', { guild: 'g1', hero: 'kirze', slot: 'weapon1', copy: 'c1' })).json(), { error: 'not_found' });
    assert.equal((await post('/api/heroes/buy', { guild: 'g1', hero: 'kirze' })).status, 200);
    assert.deepEqual(await (await post('/api/heroes/buy', { guild: 'g1', hero: 'kirze' })).json(), { error: 'owned' });
    assert.equal((await post('/api/heroes/buy', { guild: 'g1', hero: 'nobody' })).status, 404);

    assert.equal((await post('/api/heroes/equip', { guild: 'g1', hero: 'kirze', slot: 'weapon1', copy: 'c1' })).status, 200);
    const wrong = await post('/api/heroes/equip', { guild: 'g1', hero: 'kirze', slot: 'treasure', copy: 'c1' });
    assert.equal(wrong.status, 409);
    assert.deepEqual(await wrong.json(), { error: 'wrong_slot' });
    assert.equal((await post('/api/heroes/equip', { guild: 'g1', hero: 'kirze', slot: 'weapon3', copy: 'c1' })).status, 400);
    assert.equal((await post('/api/heroes/unequip', { guild: 'g1', hero: 'kirze', slot: 'weapon1' })).status, 200);
    assert.equal((await post('/api/heroes/unequip', { guild: 'g1', hero: 'kirze' })).status, 200);
    assert.equal((await post('/api/heroes/buy', { guild: 'g2', hero: 'clause' })).status, 403);
    assert.deepEqual(calls, ['equip kirze weapon1 c1', 'buy g1 u1 kirze', 'buy g1 u1 kirze', 'buy g1 u1 nobody', 'equip kirze weapon1 c1', 'equip kirze treasure c1', 'unequip kirze weapon1', 'unequip kirze null']);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('heroes: both weapons and both armors of one set, each for its class, give the set its effect (treasures apart)', () => {
  const cleaver = { item: item('tri-head-cleaver'), level: 1 };
  const harness = { item: item('venomscale-harness'), level: 1 };
  const ward = { item: item('antivenom-ward'), level: 1 }; // the priest's
  const heart = { item: item('galgorias-heart'), level: 1 };
  assert.deepEqual(heroSet([cleaver, cleaver, harness, harness, heart], 'warrior'), { set: 'perseverance', pieces: 4 });
  assert.equal(activeSet(heroSet([cleaver, cleaver, harness, harness], 'warrior')), 'perseverance');
  assert.equal(activeSet(heroSet([cleaver, cleaver, harness, ward], 'warrior')), null);
  assert.equal(activeSet(heroSet([cleaver, cleaver, harness, harness], 'knight')), null, 'not for a knight');
  assert.equal(heroSet([heart], 'warrior'), null, 'a treasure is apart from the set');
  assert.ok(setLines(heroSet([cleaver, cleaver, harness, harness], 'warrior'), 'warrior')[0]?.includes('**Perseverance set**'));
  const copies = ['a', 'b', 'c', 'd'].map((id, i) => ({ _id: id, itemId: i < 2 ? 'tri-head-cleaver' : 'venomscale-harness', level: 1 }));
  const member = { heroes: { kirze: { boughtAt: new Date(0), equipment: { weapon1: 'a', weapon2: 'b', armor1: 'c', armor2: 'd' } } } };
  assert.equal(raidGear(copies, member).get('kirze')?.set, 'perseverance');
});
