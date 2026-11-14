import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import { checkHeroLoadoutName, heroLoadoutCopyIds, heroLoadoutCount, heroLoadoutMoves, heroLoadoutViews, nextHeroLoadoutPrice } from '../src/lib/game/hero-loadouts.js';
import { keptCopyIds } from '../src/lib/game/items/loadouts.js';
import { findSpec } from '../src/lib/settings-spec.js';
import { HERO_LOADOUT_SLOTS, HERO_LOADOUTS } from '../src/protocol/heroes.js';
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

test("hero gear loadouts: King's Raid's Gear Custom, 4 to begin with and up to 40 bought one at a time; each keeps Armor, Mantle, Accessory, Orb and Artifact", () => {
  assert.deepEqual(HERO_LOADOUTS, { free: 4, most: 40, maxNameLength: 24 });
  assert.deepEqual(HERO_LOADOUT_SLOTS, ['armor', 'secondary', 'accessory', 'orb', 'artifact']);
  assert.equal(heroLoadoutCount(undefined), 4);
  assert.equal(heroLoadoutCount({ heroLoadoutSlots: null }), 4);
  assert.equal(heroLoadoutCount({ heroLoadoutSlots: 7 }), 7);
  assert.equal(heroLoadoutCount({ heroLoadoutSlots: 99 }), 40);
  assert.equal(nextHeroLoadoutPrice({ heroLoadoutSlots: 39 }, 5000), 5000);
  assert.equal(nextHeroLoadoutPrice({ heroLoadoutSlots: 40 }, 5000), null);
  // (Its price is a setting: 5,000 zeiucoins each.)
  assert.equal(CONFIG.hero.loadoutPrice, 5000);
  assert.ok(findSpec('hero.loadoutPrice'));
});

test('hero gear loadouts: what each keeps (only copies still theirs, only its five slots), and their names', () => {
  const member: Partial<MemberDoc> = {
    heroLoadoutSlots: 5,
    heroLoadouts: {
      '1': { name: 'Galgoria', pieces: { armor: 'a1', secondary: 'm1', orb: 'gone', weapon: 'w1' } },
      '3': { pieces: null },
      // (Past the ones they have: not theirs.)
      '9': { pieces: { armor: 'x9' } },
    },
  };
  const views = heroLoadoutViews(member, new Set(['a1', 'm1', 'w1']));
  assert.equal(views.length, 5);
  assert.deepEqual(views[0], { number: 1, name: 'Galgoria', pieces: { armor: 'a1', secondary: 'm1', accessory: null, orb: null, artifact: null } });
  assert.deepEqual(views[2], { number: 3, name: null, pieces: { armor: null, secondary: null, accessory: null, orb: null, artifact: null } });
  // Kept from selling and refining, as a worn piece is.
  assert.deepEqual([...heroLoadoutCopyIds(member)].sort(), ['a1', 'gone', 'm1']);
  assert.ok(keptCopyIds(member).has('a1'));
  assert.ok(!keptCopyIds(member).has('x9'));

  assert.deepEqual(checkHeroLoadoutName('  Dragon   Raid  '), { ok: true, name: 'Dragon Raid' });
  assert.deepEqual(checkHeroLoadoutName(''), { ok: true, name: null });
  assert.deepEqual(checkHeroLoadoutName('x'.repeat(25)), { ok: false, reason: 'too_long' });
  assert.deepEqual(checkHeroLoadoutName('<b>hi</b>'), { ok: false, reason: 'bad_name' });
});

test('hero gear loadouts: putting one on a hero moves each piece off any other hero, and only while nothing moved meanwhile', () => {
  const heroes: MemberDoc['heroes'] = {
    kirze: { boughtAt: new Date(0), equipment: { armor: 'old', orb: 'o1' } },
    seria: { boughtAt: new Date(0), equipment: { armor: 'a1', accessory: 'r1' } },
  };
  const { match, set } = heroLoadoutMoves(
    heroes,
    'kirze',
    [
      { slot: 'armor', copy: 'a1' },
      { slot: 'orb', copy: 'o1' },
    ],
    ['artifact'],
  );
  assert.deepEqual(set, {
    'heroes.seria.equipment.armor': null,
    'heroes.kirze.equipment.artifact': null,
    'heroes.kirze.equipment.armor': 'a1',
    'heroes.kirze.equipment.orb': 'o1',
  });
  // Where they are now, still there; nowhere else holds them (its own slots they go in aren't asked).
  assert.equal(match['heroes.seria.equipment.armor'], 'a1');
  assert.deepEqual(match['heroes.seria.equipment.accessory'], { $nin: ['a1', 'o1'] });
  assert.deepEqual(match['heroes.kirze.equipment.weapon'], { $nin: ['a1', 'o1'] });
  assert.equal('heroes.kirze.equipment.armor' in match, false);
  assert.equal('heroes.kirze.equipment.orb' in match, false);
});

test('heroes view: their hero gear loadouts, and what the next costs', () => {
  const view = heroesView([], { heroes: {}, points: 0, gems: 0, essences: {}, heroLoadoutSlots: 40, heroLoadouts: { '2': { name: 'Dragons', pieces: { armor: 'nope' } } } } as never);
  assert.equal(view.loadouts?.slots.length, 40);
  assert.deepEqual(view.loadouts?.slots[1], { number: 2, name: 'Dragons', pieces: { armor: null, secondary: null, accessory: null, orb: null, artifact: null } });
  assert.equal(view.loadouts?.next, null);
  assert.equal(heroesView([], null).loadouts?.next, 5000);
});

test('heroes web: hero gear loadouts are saved, put on, emptied, named and bought; never shown on someone else’s heroes', async () => {
  const mine = { heroes: [], copies: [], balance: 0, runes: [], loadouts: { slots: [], next: 5000 } } as unknown as HeroesView;
  const calls: string[] = [];
  const store = {
    view: async () => mine,
    loadoutSave: async (_g: string, _u: string, hero: string, number: number) => (calls.push(`save ${hero} ${number}`), number > 4 ? 'locked' : mine),
    loadoutEquip: async (_g: string, _u: string, hero: string, number: number) => (calls.push(`equip ${hero} ${number}`), number === 2 ? 'empty' : mine),
    loadoutReset: async (_g: string, _u: string, number: number) => (calls.push(`reset ${number}`), mine),
    loadoutName: async (_g: string, _u: string, number: number, name: string) => (calls.push(`name ${number} ${name}`), name.length > 24 ? 'too_long' : mine),
    loadoutBuy: async () => (calls.push('buy'), 'too_poor'),
  } as unknown as HeroStore;
  const deps: ApiDeps = {
    config: SITE,
    clientId: () => '999',
    guild: (id) => (id === 'g1' ? { name: id, icon: null } : null),
    memberName: async (guildId, userId) => (userId === 'u1' ? 'ZEIU' : userId === '22' ? 'Pine' : null),
    balance: async () => 0,
    heroes: store,
  };
  const session = signSession({ userId: 'u1', name: 'ZEIU', avatar: null, guildIds: ['g1'] }, 'shh');
  const headers = { Origin: SITE.origin, 'Content-Type': 'application/json', Authorization: `Bearer ${session}` };
  const server: Server = createServer(createApi(deps));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify({ guild: 'g1', ...(body as object) }) });
  try {
    assert.equal((await post('/api/heroes/loadout/save', { hero: 'kirze', loadout: 1 })).status, 200);
    assert.deepEqual(await (await post('/api/heroes/loadout/save', { hero: 'kirze', loadout: 5 })).json(), { error: 'locked' });
    assert.equal((await post('/api/heroes/loadout/save', { hero: 'kirze', loadout: 41 })).status, 400);
    assert.equal((await post('/api/heroes/loadout/equip', { hero: 'seria', loadout: 1 })).status, 200);
    assert.deepEqual(await (await post('/api/heroes/loadout/equip', { hero: 'seria', loadout: 2 })).json(), { error: 'empty' });
    assert.equal((await post('/api/heroes/loadout/reset', { loadout: 3 })).status, 200);
    assert.equal((await post('/api/heroes/loadout/name', { loadout: 3, name: 'Galgoria' })).status, 200);
    assert.deepEqual(await (await post('/api/heroes/loadout/name', { loadout: 3, name: 'x'.repeat(30) })).json(), { error: 'too_long' });
    assert.deepEqual(await (await post('/api/heroes/loadout/buy', {})).json(), { error: 'too_poor' });
    assert.deepEqual(calls, ['save kirze 1', 'save kirze 5', 'equip seria 1', 'equip seria 2', 'reset 3', 'name 3 Galgoria', `name 3 ${'x'.repeat(30)}`, 'buy']);
    // Someone else's: no loadouts.
    const theirs = (await (await fetch(`${base}/api/heroes?guild=g1&user=22`, { headers })).json()) as HeroesView;
    assert.equal(theirs.loadouts, undefined);
    assert.ok(((await (await fetch(`${base}/api/heroes?guild=g1`, { headers })).json()) as HeroesView).loadouts);
  } finally {
    server.close();
  }
});
