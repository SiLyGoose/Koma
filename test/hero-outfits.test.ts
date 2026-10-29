import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { DEFAULTS } from '../src/config.js';
import { HERO_OUTFITS, HEROES, HEROES_BY_ID } from '../src/data/heroes.js';
import { findSpec, validateSettings } from '../src/lib/settings-spec.js';
import { ownedHeroOutfits, wornSkin } from '../src/services/hero-outfits.js';
import { createApi, type ApiDeps } from '../src/web/api.js';
import { signSession } from '../src/web/auth/login.js';
import type { WebConfig } from '../src/web/config.js';
import type { HeroOutfitsView, HeroOutfitStore } from '../src/web/models/hero-outfits.js';

const SITE: WebConfig = {
  siteUrl: 'https://koma-ui.vercel.app',
  origin: 'https://koma-ui.vercel.app',
  apiUrl: 'https://koma.duckdns.org',
  socketUrl: 'wss://koma.duckdns.org',
  port: 0,
  clientSecret: 'shh',
};

test("hero outfits: a hero's skins after its own look are its outfits, each its own and named for it", () => {
  const kirze = HEROES_BY_ID.get('kirze');
  assert.equal(kirze?.outfits[0], 'Kirze');
  assert.equal(kirze?.outfits.length, kirze?.skins);
  assert.ok(kirze?.outfits.includes('Kirze_Glory'));
  assert.deepEqual(HERO_OUTFITS.get('Kirze_Glory'), { hero: 'kirze', skin: kirze?.outfits.indexOf('Kirze_Glory') });
  // Every outfit is one hero's, once.
  assert.equal(HERO_OUTFITS.size, HEROES.reduce((sum, hero) => sum + hero.outfits.length - 1, 0));
  assert.ok(HERO_OUTFITS.size > 200);
});

test('hero outfits: a hero has the ones bought for it, and wears its own look unless it has one of them on', () => {
  const [first, second] = HEROES_BY_ID.get('kirze')!.outfits.slice(1);
  assert.deepEqual(ownedHeroOutfits('kirze', null), []);
  assert.deepEqual(ownedHeroOutfits('kirze', { outfits: [second, 'gone', 'Annette_Halloween', first] }), [first, second]); // in its skins' order, only its own
  assert.equal(wornSkin('kirze', null), 0);
  assert.equal(wornSkin('kirze', { outfits: [first], outfit: null }), 0);
  assert.equal(wornSkin('kirze', { outfits: [first], outfit: first }), 1);
  assert.equal(wornSkin('kirze', { outfits: [first], outfit: second }), 0); // not bought
  assert.equal(wornSkin('kirze', { outfits: ['Annette_Halloween'], outfit: 'Annette_Halloween' }), 0); // another hero's
});

test("hero outfits: their price is a Hero setting, 5,000 points to start", () => {
  assert.equal(DEFAULTS.hero.outfitPrice, 5_000);
  assert.equal(findSpec('hero.outfitPrice')?.group, 'Hero');
  assert.deepEqual(validateSettings(structuredClone(DEFAULTS)), []);
});

test("hero outfits web: a logged-in member sees every hero's outfits, buys one (not putting it on) and puts it on their hero, in their own servers only", async () => {
  const outfits = HEROES.flatMap((hero) => hero.outfits.slice(1).map((id) => ({ id, hero: hero.id })));
  const view = (state: { owned: string[]; worn: Record<string, string>; balance: number }): HeroOutfitsView => ({
    outfits: outfits.map(({ id, hero }) => ({ id, hero, price: 3000, owned: state.owned.includes(id) })),
    heroes: ['kirze'],
    worn: state.worn,
    balance: state.balance,
  });
  let state = { owned: [] as string[], worn: {} as Record<string, string>, balance: 4000 };
  const calls: string[] = [];
  const store: HeroOutfitStore = {
    view: async () => view(state),
    buy: async (guildId, userId, id) => {
      calls.push(`buy ${guildId} ${userId} ${id}`);
      const of = HERO_OUTFITS.get(id);
      if (!of) return 'not_found';
      if (of.hero !== 'kirze') return 'not_owned';
      if (state.owned.includes(id)) return 'owned';
      if (state.balance < 3000) return 'too_poor';
      state = { ...state, owned: [...state.owned, id], balance: state.balance - 3000 };
      return view(state);
    },
    wear: async (guildId, userId, hero, id) => {
      calls.push(`wear ${guildId} ${userId} ${hero} ${id}`);
      if (id !== null && HERO_OUTFITS.get(id)?.hero !== hero) return 'not_found';
      if (id !== null && !state.owned.includes(id)) return 'not_owned';
      const worn = { ...state.worn };
      if (id === null) delete worn[hero];
      else worn[hero] = id;
      state = { ...state, worn };
      return view(state);
    },
  };
  const deps: ApiDeps = {
    config: SITE,
    clientId: () => '999',
    guild: (id) => (id === 'g1' || id === 'g2' ? { name: id, icon: null } : null),
    memberName: async (guildId, userId) => (guildId === 'g1' && userId === 'u1' ? 'ZEIU' : null),
    balance: async () => 0,
    heroOutfits: store,
  };
  const session = signSession({ userId: 'u1', name: 'ZEIU', avatar: null, guildIds: ['g1', 'g2'] }, 'shh');
  const headers = { Origin: SITE.origin, 'Content-Type': 'application/json', Authorization: `Bearer ${session}` };
  const post = (path: string, body: unknown): RequestInit & { path: string } => ({ path, method: 'POST', headers, body: JSON.stringify(body) });

  const server: Server = createServer(createApi(deps));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const send = ({ path, ...init }: RequestInit & { path: string }) => fetch(`${base}${path}`, init);
  try {
    const get = await fetch(`${base}/api/hero-outfits?guild=g1`, { headers });
    assert.equal(get.status, 200);
    assert.deepEqual(await get.json(), view(state));
    assert.equal((await fetch(`${base}/api/hero-outfits?guild=g2`, { headers })).status, 403); // left that server
    assert.equal((await fetch(`${base}/api/hero-outfits?guild=g1`, { headers: { Origin: SITE.origin } })).status, 401);

    // Not theirs to wear yet.
    const early = await send(post('/api/hero-outfits/wear', { guild: 'g1', hero: 'kirze', outfit: 'Kirze_Glory' }));
    assert.equal(early.status, 409);
    assert.deepEqual(await early.json(), { error: 'not_owned' });

    // Bought, and still in its own look until it's put on.
    const bought = await send(post('/api/hero-outfits/buy', { guild: 'g1', outfit: 'Kirze_Glory' }));
    assert.equal(bought.status, 200);
    assert.deepEqual(await bought.json(), view({ owned: ['Kirze_Glory'], worn: {}, balance: 1000 }));
    const worn = await send(post('/api/hero-outfits/wear', { guild: 'g1', hero: 'kirze', outfit: 'Kirze_Glory' }));
    assert.deepEqual(((await worn.json()) as HeroOutfitsView).worn, { kirze: 'Kirze_Glory' });

    // Not twice; nor one they can't pay for; nor for a hero they don't own; nor one there isn't; nor on another hero.
    assert.deepEqual(await (await send(post('/api/hero-outfits/buy', { guild: 'g1', outfit: 'Kirze_Glory' }))).json(), { error: 'owned' });
    const poor = await send(post('/api/hero-outfits/buy', { guild: 'g1', outfit: 'Kirze_Halloween' }));
    assert.equal(poor.status, 409);
    assert.deepEqual(await poor.json(), { error: 'too_poor' });
    assert.deepEqual(await (await send(post('/api/hero-outfits/buy', { guild: 'g1', outfit: 'Annette_Halloween' }))).json(), { error: 'not_owned' });
    assert.equal((await send(post('/api/hero-outfits/buy', { guild: 'g1', outfit: 'nobody' }))).status, 404);
    assert.equal((await send(post('/api/hero-outfits/wear', { guild: 'g1', hero: 'annette', outfit: 'Kirze_Glory' }))).status, 404);

    // Back to its own look.
    const back = await send(post('/api/hero-outfits/wear', { guild: 'g1', hero: 'kirze', outfit: null }));
    assert.deepEqual(((await back.json()) as HeroOutfitsView).worn, {});

    assert.equal((await send(post('/api/hero-outfits/buy', { guild: 'g1' }))).status, 400);
    assert.equal((await send(post('/api/hero-outfits/wear', { guild: 'g1', outfit: 'Kirze_Glory' }))).status, 400);
    assert.equal((await send(post('/api/hero-outfits/buy', { guild: 'g2', outfit: 'Kirze_Halloween' }))).status, 403);
    assert.deepEqual(calls, [
      'wear g1 u1 kirze Kirze_Glory',
      'buy g1 u1 Kirze_Glory',
      'wear g1 u1 kirze Kirze_Glory',
      'buy g1 u1 Kirze_Glory',
      'buy g1 u1 Kirze_Halloween',
      'buy g1 u1 Annette_Halloween',
      'buy g1 u1 nobody',
      'wear g1 u1 annette Kirze_Glory',
      'wear g1 u1 kirze null',
    ]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
