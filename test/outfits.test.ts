import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { GROUPS } from '../src/commands/config.js';
import { DEFAULTS } from '../src/config.js';
import { DEFAULT_OUTFIT, OUTFITS, OUTFITS_BY_ID } from '../src/data/outfits.js';
import { findSpec, validateSettings } from '../src/lib/settings-spec.js';
import { ownedOutfits, wornOutfit } from '../src/services/outfits.js';
import { createApi, type ApiDeps } from '../src/web/api.js';
import { signSession } from '../src/web/auth/login.js';
import type { WebConfig } from '../src/web/config.js';
import type { OutfitsView, OutfitStore } from '../src/web/models/outfits.js';

const SITE: WebConfig = {
  siteUrl: 'https://koma-ui.vercel.app',
  origin: 'https://koma-ui.vercel.app',
  apiUrl: 'https://koma.duckdns.org',
  socketUrl: 'wss://koma.duckdns.org',
  port: 0,
  clientSecret: 'shh',
};

test('outfits: Tsuri is everyone\'s, first, and the others are Yae Pixo and Speve, each once', () => {
  assert.equal(DEFAULT_OUTFIT, 'tsuri');
  assert.deepEqual(
    OUTFITS.map((o) => [o.id, o.name]),
    [
      ['tsuri', 'Tsuri'],
      ['yae-pixo', 'Yae Pixo'],
      ['speve', 'Speve'],
    ],
  );
  assert.equal(OUTFITS_BY_ID.size, OUTFITS.length);
});

test('outfits: a member has the default and what they bought, and wears the default unless they put on one of theirs', () => {
  assert.deepEqual(ownedOutfits(null), ['tsuri']);
  assert.deepEqual(ownedOutfits({ outfits: ['speve', 'gone', 'yae-pixo'] }), ['tsuri', 'yae-pixo', 'speve']); // in the shop's order, without one that's gone
  assert.equal(wornOutfit(null), 'tsuri');
  assert.equal(wornOutfit({ outfits: ['speve'], outfit: null }), 'tsuri');
  assert.equal(wornOutfit({ outfits: ['speve'], outfit: 'speve' }), 'speve');
  assert.equal(wornOutfit({ outfits: ['speve'], outfit: 'yae-pixo' }), 'tsuri'); // not theirs
  assert.equal(wornOutfit({ outfit: 'gone' }), 'tsuri');
});

test('outfits: their price is a setting in its own group, 3,000 points to start', () => {
  assert.deepEqual(DEFAULTS.outfit, { price: 3_000 });
  assert.equal(findSpec('outfit.price')?.group, 'Outfit');
  assert.ok(GROUPS.includes('Outfit'));
  assert.deepEqual(validateSettings(structuredClone(DEFAULTS)), []);
});

test('outfits web: a logged-in member sees the outfits, buys one (not putting it on) and puts one on, in their own servers only', async () => {
  const view = (worn: string, owned: string[], balance: number): OutfitsView => ({
    outfits: OUTFITS.map(({ id, name }) => ({ id, name, price: id === 'tsuri' ? 0 : 3000, owned: id === 'tsuri' || owned.includes(id) })),
    worn,
    balance,
  });
  let state = { worn: 'tsuri', owned: [] as string[], balance: 4000 };
  const calls: string[] = [];
  const store: OutfitStore = {
    view: async () => view(state.worn, state.owned, state.balance),
    buy: async (guildId, userId, id) => {
      calls.push(`buy ${guildId} ${userId} ${id}`);
      if (!OUTFITS_BY_ID.has(id)) return 'not_found';
      if (id === 'tsuri' || state.owned.includes(id)) return 'owned';
      if (state.balance < 3000) return 'too_poor';
      state = { ...state, owned: [...state.owned, id], balance: state.balance - 3000 };
      return view(state.worn, state.owned, state.balance);
    },
    wear: async (guildId, userId, id) => {
      calls.push(`wear ${guildId} ${userId} ${id}`);
      if (!OUTFITS_BY_ID.has(id)) return 'not_found';
      if (id !== 'tsuri' && !state.owned.includes(id)) return 'not_owned';
      state = { ...state, worn: id };
      return view(state.worn, state.owned, state.balance);
    },
  };
  const deps: ApiDeps = {
    config: SITE,
    clientId: () => '999',
    guild: (id) => (id === 'g1' || id === 'g2' ? { name: id, icon: null } : null),
    memberName: async (guildId, userId) => (guildId === 'g1' && userId === 'u1' ? 'ZEIU' : null),
    balance: async () => 0,
    outfits: store,
  };
  const session = signSession({ userId: 'u1', name: 'ZEIU', avatar: null, guildIds: ['g1', 'g2'] }, 'shh');
  const headers = { Origin: SITE.origin, 'Content-Type': 'application/json', Authorization: `Bearer ${session}` };
  const post = (path: string, body: unknown): RequestInit & { path: string } => ({ path, method: 'POST', headers, body: JSON.stringify(body) });

  const server: Server = createServer(createApi(deps));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const send = ({ path, ...init }: RequestInit & { path: string }) => fetch(`${base}${path}`, init);
  try {
    const get = await fetch(`${base}/api/outfits?guild=g1`, { headers });
    assert.equal(get.status, 200);
    assert.deepEqual(await get.json(), view('tsuri', [], 4000));
    assert.equal((await fetch(`${base}/api/outfits?guild=g2`, { headers })).status, 403); // left that server
    assert.equal((await fetch(`${base}/api/outfits`, { headers })).status, 400);
    assert.equal((await fetch(`${base}/api/outfits?guild=g1`, { headers: { Origin: SITE.origin } })).status, 401);

    // Not theirs to wear yet.
    const early = await send(post('/api/outfits/wear', { guild: 'g1', outfit: 'speve' }));
    assert.equal(early.status, 409);
    assert.deepEqual(await early.json(), { error: 'not_owned' });

    // Bought, and still in the default until it's put on.
    const bought = await send(post('/api/outfits/buy', { guild: 'g1', outfit: 'speve' }));
    assert.equal(bought.status, 200);
    assert.deepEqual(await bought.json(), view('tsuri', ['speve'], 1000));
    const worn = await send(post('/api/outfits/wear', { guild: 'g1', outfit: 'speve' }));
    assert.deepEqual(await worn.json(), view('speve', ['speve'], 1000));

    // Not twice, nor the default; nor one they can't pay for; nor one there isn't.
    assert.deepEqual(await (await send(post('/api/outfits/buy', { guild: 'g1', outfit: 'speve' }))).json(), { error: 'owned' });
    assert.deepEqual(await (await send(post('/api/outfits/buy', { guild: 'g1', outfit: 'tsuri' }))).json(), { error: 'owned' });
    const poor = await send(post('/api/outfits/buy', { guild: 'g1', outfit: 'yae-pixo' }));
    assert.equal(poor.status, 409);
    assert.deepEqual(await poor.json(), { error: 'too_poor' });
    assert.equal((await send(post('/api/outfits/buy', { guild: 'g1', outfit: 'nobody' }))).status, 404);

    // Back to the default.
    const back = await send(post('/api/outfits/wear', { guild: 'g1', outfit: 'tsuri' }));
    assert.deepEqual(await back.json(), view('tsuri', ['speve'], 1000));

    assert.equal((await send(post('/api/outfits/buy', { guild: 'g1' }))).status, 400);
    assert.equal((await send(post('/api/outfits/wear', { guild: 'g1', outfit: 3 }))).status, 400);
    assert.equal((await send(post('/api/outfits/buy', { guild: 'g2', outfit: 'yae-pixo' }))).status, 403);
    assert.deepEqual(calls, ['wear g1 u1 speve', 'buy g1 u1 speve', 'wear g1 u1 speve', 'buy g1 u1 speve', 'buy g1 u1 tsuri', 'buy g1 u1 yae-pixo', 'buy g1 u1 nobody', 'wear g1 u1 tsuri']);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
