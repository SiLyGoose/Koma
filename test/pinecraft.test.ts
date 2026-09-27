import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { CONFIG, DEFAULTS } from '../src/config.js';
import { PINECRAFT_ORES, PINECRAFT_ORE_TABLE, PINECRAFT_WORLD } from '../src/constants/index.js';
import { findSpec, SPECS, validateSettings } from '../src/lib/settings-spec.js';
import {
  depthOf,
  energyNow,
  groundAt,
  indexOf,
  isOpen,
  move,
  newWorld,
  oreAt,
  SPAWN,
  viewRows,
  type PinecraftRules,
  type PinecraftWorld,
} from '../src/lib/game/pinecraft.js';
import { handleApi, type ApiDeps } from '../src/web/api.js';
import type { WebConfig } from '../src/web/config.js';
import { signSession, verifySession } from '../src/web/login.js';
import { parseClientMessage, type ServerMessage } from '../src/web/pinecraft-protocol.js';
import { leave, sessionFor, type Peer, type PinecraftDeps } from '../src/web/pinecraft-server.js';
import { verifyToken } from '../src/web/token.js';

const RULES: PinecraftRules = { maxEnergy: 10, energyMinutes: 3, value: { coal: 3, iron: 6, gold: 15, diamond: 35, ruby: 60, emerald: 100 } };
const MINUTE = 60_000;

/** A block of `ground` (and holding `ore`, or none) somewhere in the world with `seed`, at least `minDepth` down. */
function find(seed: number, want: (x: number, y: number) => boolean, minDepth = 1): { x: number; y: number } {
  for (let y = PINECRAFT_WORLD.sky + minDepth; y < PINECRAFT_WORLD.depth - 1; y++) {
    for (let x = 1; x < PINECRAFT_WORLD.width - 1; x++) if (want(x, y)) return { x, y };
  }
  throw new Error('No such block');
}

/** A world with the miner at (x, y), and that block dug. */
function worldAt(seed: number, x: number, y: number): PinecraftWorld {
  const world = newWorld(seed, RULES, 0);
  world.mined.add(indexOf(x, y));
  world.x = x;
  world.y = y;
  return world;
}

// ---------------------------------------------------------------------------
// The world

test('pinecraft: a world is the same every time for its seed, with sky, grass, dirt, stone and bedrock in order', () => {
  for (let x = 0; x < PINECRAFT_WORLD.width; x++) {
    assert.equal(groundAt(5, x, 0), 'sky');
    assert.equal(groundAt(5, x, PINECRAFT_WORLD.sky), 'grass');
    assert.equal(groundAt(5, x, PINECRAFT_WORLD.sky + 1), 'dirt');
    assert.equal(groundAt(5, x, PINECRAFT_WORLD.depth - 1), 'bedrock');
  }
  const deep = PINECRAFT_WORLD.sky + PINECRAFT_WORLD.dirtRows + PINECRAFT_WORLD.mixRows + 1;
  for (let x = 0; x < PINECRAFT_WORLD.width; x++) assert.ok(['stone', 'cave'].includes(groundAt(5, x, deep + 20)));
  for (let y = 0; y < 100; y++) for (let x = 0; x < PINECRAFT_WORLD.width; x++) assert.equal(oreAt(5, x, y), oreAt(5, x, y));
  // Different seeds, different worlds.
  const differs = Array.from({ length: 200 }, (_, y) => y).some((y) => oreAt(1, 10, y) !== oreAt(2, 10, y) || groundAt(1, 10, y) !== groundAt(2, 10, y));
  assert.ok(differs);
});

test('pinecraft: ores only turn up in ground, and each only from its depth down', () => {
  let found = 0;
  for (let seed = 1; seed <= 5; seed++) {
    for (let y = 0; y < PINECRAFT_WORLD.depth; y++) {
      for (let x = 0; x < PINECRAFT_WORLD.width; x++) {
        const ore = oreAt(seed, x, y);
        if (!ore) continue;
        found++;
        assert.ok(['dirt', 'stone'].includes(groundAt(seed, x, y)));
        assert.ok(depthOf(y) >= PINECRAFT_ORE_TABLE[ore].from, `${ore} at depth ${depthOf(y)}`);
      }
    }
  }
  assert.ok(found > 500);
  // Every ore can be found in some world.
  for (const ore of PINECRAFT_ORES) find(1, (x, y) => oreAt(1, x, y) === ore);
});

// ---------------------------------------------------------------------------
// Moving, digging and energy

test('pinecraft: walking through sky and dug ground is free; digging a block takes one energy and moves into it', () => {
  const world = newWorld(3, RULES, 0);
  assert.deepEqual({ x: world.x, y: world.y }, SPAWN);
  assert.deepEqual(move(world, 'left', RULES, 0), { kind: 'walk' });
  assert.equal(world.energy, RULES.maxEnergy);
  assert.deepEqual(move(world, 'up', RULES, 0), { kind: 'walk' });
  assert.deepEqual(move(world, 'down', RULES, 0), { kind: 'walk' });
  const dig = move(world, 'down', RULES, 0);
  assert.equal(dig.kind, 'dig');
  assert.deepEqual(dig.kind === 'dig' && { ground: dig.ground, ore: dig.ore, points: dig.points }, { ground: 'grass', ore: null, points: 0 });
  assert.equal(world.energy, RULES.maxEnergy - 1);
  assert.equal(world.y, PINECRAFT_WORLD.sky);
  assert.ok(isOpen(world, world.x, world.y));
  // Back up and down again: it is dug now, so it's free.
  move(world, 'up', RULES, 0);
  assert.deepEqual(move(world, 'down', RULES, 0), { kind: 'walk' });
  assert.equal(world.energy, RULES.maxEnergy - 1);
});

test('pinecraft: an ore pays its value when dug', () => {
  const at = find(8, (x, y) => oreAt(8, x, y) === 'iron' && groundAt(8, x - 1, y) !== 'cave');
  const world = worldAt(8, at.x - 1, at.y);
  const result = move(world, 'right', RULES, 0);
  assert.deepEqual(result, { kind: 'dig', ground: groundAt(8, at.x, at.y), ore: 'iron', points: 6, index: indexOf(at.x, at.y) });
});

test('pinecraft: the edge and bedrock stop the miner, and with no energy nothing is dug', () => {
  const world = newWorld(3, RULES, 0);
  world.x = 0;
  assert.deepEqual(move(world, 'left', RULES, 0), { kind: 'edge' });
  world.y = 0;
  assert.deepEqual(move(world, 'up', RULES, 0), { kind: 'edge' });

  const bottom = worldAt(3, 10, PINECRAFT_WORLD.depth - 2);
  assert.deepEqual(move(bottom, 'down', RULES, 0), { kind: 'bedrock' });
  assert.equal(bottom.energy, RULES.maxEnergy);

  const tired = newWorld(3, RULES, 0);
  tired.energy = 0;
  tired.energyAt = 0;
  assert.deepEqual(move(tired, 'down', RULES, MINUTE), { kind: 'tired' });
  assert.equal(tired.y, SPAWN.y);
  assert.equal(tired.mined.size, 0);
});

test('pinecraft: energy comes back one every energyMinutes, up to the most, and part of one carries over', () => {
  assert.deepEqual(energyNow({ energy: 4, energyAt: 0 }, RULES, 2 * MINUTE), { energy: 4, energyAt: 0 });
  assert.deepEqual(energyNow({ energy: 4, energyAt: 0 }, RULES, 7 * MINUTE), { energy: 6, energyAt: 6 * MINUTE });
  assert.deepEqual(energyNow({ energy: 9, energyAt: 0 }, RULES, 60 * MINUTE), { energy: 10, energyAt: 60 * MINUTE });
  // Digging from full: the next one comes back energyMinutes after that dig.
  const world = newWorld(3, RULES, 0);
  move(world, 'down', RULES, 5 * MINUTE);
  assert.deepEqual({ energy: world.energy, energyAt: world.energyAt }, { energy: 9, energyAt: 5 * MINUTE });
  assert.equal(energyNow(world, RULES, 8 * MINUTE).energy, 10);
});

test('pinecraft: the page is only shown the ores next to ground the miner can walk to', () => {
  const seed = 11;
  const at = find(seed, (x, y) => oreAt(seed, x, y) !== null && groundAt(seed, x, y - 1) !== 'cave' && groundAt(seed, x, y - 2) !== 'cave' && oreAt(seed, x, y - 1) === null, 30);
  // Tunnel straight down from the grass to two blocks above the ore.
  const world = newWorld(seed, RULES, 0);
  world.x = at.x;
  for (let y = PINECRAFT_WORLD.sky; y <= at.y - 2; y++) world.mined.add(indexOf(at.x, y));
  world.y = at.y - 2;
  const rows = (w: PinecraftWorld) => viewRows(w, at.y, at.y, 40)[0] as string;
  assert.match(rows(world)[at.x] as string, /[DS]/); // hidden: not next to the tunnel yet
  // One more block down, and it's next to the tunnel.
  world.mined.add(indexOf(at.x, at.y - 1));
  world.y = at.y - 1;
  assert.match(rows(world)[at.x] as string, /[ciorxe]/);
  // The tunnel itself is open, and the sky is too.
  assert.equal(viewRows(world, at.y - 1, at.y - 1, 40)[0]?.[at.x], '.');
  assert.equal(viewRows(world, 0, 0, 400)[0], '.'.repeat(PINECRAFT_WORLD.width));
});

// ---------------------------------------------------------------------------
// Settings

test('pinecraft: the settings exist, are in their own group, and start at the tuned values', () => {
  assert.deepEqual(DEFAULTS.pinecraft, { maxEnergy: 100, energyMinutes: 3, value: { coal: 3, iron: 6, gold: 15, diamond: 35, ruby: 60, emerald: 100 } });
  assert.deepEqual(CONFIG.pinecraft, DEFAULTS.pinecraft);
  const keys = SPECS.filter((s) => s.key.startsWith('pinecraft.')).map((s) => s.key);
  assert.deepEqual(keys, ['pinecraft.maxEnergy', 'pinecraft.energyMinutes', ...PINECRAFT_ORES.map((ore) => `pinecraft.value.${ore}`)]);
  for (const key of keys) assert.equal(findSpec(key)?.group, 'Pinecraft');
  assert.deepEqual(validateSettings(structuredClone(DEFAULTS)), []);
});

// ---------------------------------------------------------------------------
// Playing on the web

test('pinecraft web: only well-formed messages from the page are read', () => {
  assert.deepEqual(parseClientMessage('{"t":"hello","token":"a.b"}'), { t: 'hello', token: 'a.b' });
  assert.deepEqual(parseClientMessage('{"t":"move","dir":"down","seq":3}'), { t: 'move', dir: 'down', seq: 3 });
  for (const bad of ['', 'null', '{"t":"move","dir":"north","seq":1}', '{"t":"move","dir":"up","seq":0}', '{"t":"move","dir":"up"}', '{"t":"cashout","seq":1}']) {
    assert.equal(parseClientMessage(bad), null, bad);
  }
});

function fakeDeps(seed: number) {
  const saved = { digs: [] as number[], where: 0, paid: [] as [string, number][] };
  let balance = 500;
  const deps: PinecraftDeps = {
    load: async () => ({ world: newWorld(seed, RULES, 0), earned: 0 }),
    saveDig: async (_g, _u, _w, index) => void saved.digs.push(index),
    saveWhere: async () => void saved.where++,
    payOre: async (_g, _u, ore, points) => {
      saved.paid.push([ore, points]);
      return (balance += points);
    },
    balance: async () => balance,
    rules: () => RULES,
    now: () => 0,
  };
  return { deps, saved };
}

function fakePeer(): Peer & { got: ServerMessage[]; closed: boolean } {
  const peer = { got: [] as ServerMessage[], closed: false, send: (m: ServerMessage) => void peer.got.push(m), close: () => void (peer.closed = true) };
  return peer;
}

test('pinecraft web: a dig is saved before its ore is paid, and a new page takes over the same world', async () => {
  const { deps, saved } = fakeDeps(4);
  const player = { guildId: 'g1', userId: 'u1', name: 'Simon' };
  const session = await sessionFor(player, deps);
  assert.equal(await sessionFor(player, deps), session);
  const first = fakePeer();
  session.attach(first);
  const hello = first.got[0];
  assert.ok(hello?.t === 'state');
  assert.equal(hello.seq, 0);
  assert.equal(hello.state.energy, RULES.maxEnergy);
  assert.equal(hello.state.balance, 500);
  assert.equal(hello.state.rows.length, hello.state.y - hello.state.top + 15);

  await session.handle(first, { t: 'move', dir: 'down', seq: 1 });
  const dug = first.got[1];
  assert.ok(dug?.t === 'state');
  assert.deepEqual(dug.event, { kind: 'dig', ground: 'grass', ore: null, points: 0 });
  assert.equal(dug.state.energy, RULES.maxEnergy - 1);
  assert.deepEqual(saved.digs, [indexOf(SPAWN.x, SPAWN.y + 1)]);

  // Another page takes over: the first is no longer listened to.
  const second = fakePeer();
  session.attach(second);
  await session.handle(first, { t: 'move', dir: 'down', seq: 2 });
  assert.equal(first.got.length, 2);
  await leave(session, first); // the old page closing changes nothing
  assert.equal(await sessionFor(player, deps), session);
  await leave(session, second);
  assert.ok(saved.where >= 1);
  assert.notEqual(await sessionFor(player, deps), session); // forgotten once nobody plays it
});

// ---------------------------------------------------------------------------
// Logging in on the site

const SITE: WebConfig = {
  siteUrl: 'https://koma-ui.vercel.app',
  origin: 'https://koma-ui.vercel.app',
  apiUrl: 'https://koma.duckdns.org',
  socketUrl: 'wss://koma.duckdns.org',
  port: 0,
  clientSecret: 'shh',
};

test('login: a session says who logged in, and a changed or foreign one says nobody', () => {
  const session = { userId: '123', name: 'Simon', avatar: null, guildIds: ['g1'] };
  const token = signSession(session, 'shh', 1000);
  assert.deepEqual(verifySession(token, 'shh', 2000), session);
  assert.equal(verifySession(token, 'other', 2000), null);
  assert.equal(verifySession(token, 'shh', 1000 + 8 * 24 * 60 * MINUTE), null);
  assert.equal(verifySession(`${token}x`, 'shh', 2000), null);
});

async function withApi(deps: ApiDeps, run: (base: string) => Promise<void>): Promise<void> {
  const server: Server = createServer((req, res) => void handleApi(req, res, deps).then((handled) => (handled ? undefined : res.writeHead(404).end())));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('login: the site logs in with Discord, sees its servers, and gets a link to play in one', async () => {
  const deps: ApiDeps = {
    config: SITE,
    clientId: () => '999',
    guild: (id) => (id === 'g1' ? { name: 'Koma Club', icon: null } : null),
    memberName: async (guildId, userId) => (guildId === 'g1' && userId === '123' ? 'Simon in Koma' : null),
    balance: async () => 1234,
    login: async (code) => {
      if (code !== 'good') throw new Error('bad code');
      return { userId: '123', name: 'Simon', avatar: 'abc', guildIds: ['g1', 'g2'] };
    },
  };
  const site = { Origin: SITE.origin, 'Content-Type': 'application/json' };
  await withApi(deps, async (base) => {
    const go = await fetch(`${base}/api/login?state=abcdefgh1234`, { redirect: 'manual' });
    assert.equal(go.status, 302);
    const to = new URL(go.headers.get('location') ?? '');
    assert.equal(to.origin, 'https://discord.com');
    assert.equal(to.searchParams.get('client_id'), '999');
    assert.equal(to.searchParams.get('redirect_uri'), 'https://koma-ui.vercel.app/');
    assert.equal(to.searchParams.get('state'), 'abcdefgh1234');

    assert.equal((await fetch(`${base}/api/login`, { method: 'POST', headers: site, body: '{"code":"bad"}' })).status, 502);
    // Only the site's own origin is answered.
    assert.equal((await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"code":"good"}' })).status, 404);

    const login = await fetch(`${base}/api/login`, { method: 'POST', headers: site, body: '{"code":"good"}' });
    assert.equal(login.status, 200);
    assert.equal(login.headers.get('access-control-allow-origin'), SITE.origin);
    const { session, me } = (await login.json()) as { session: string; me: { servers: { id: string; balance: number }[]; games: string[] } };
    assert.deepEqual(me.servers, [{ id: 'g1', name: 'Koma Club', icon: null, balance: 1234 }]); // g2 doesn't have the bot
    assert.deepEqual(me.games, ['mines', 'pinecraft']);

    const auth = { ...site, Authorization: `Bearer ${session}` };
    assert.equal((await fetch(`${base}/api/me`, { headers: site })).status, 401);
    assert.equal((await fetch(`${base}/api/me`, { headers: auth })).status, 200);

    const play = await fetch(`${base}/api/play`, { method: 'POST', headers: auth, body: '{"guild":"g1","game":"pinecraft"}' });
    const { url } = (await play.json()) as { url: string };
    assert.ok(url.startsWith('https://koma-ui.vercel.app/games/pinecraft/#t='));
    const token = decodeURIComponent(new URLSearchParams(new URL(url).hash.slice(1)).get('t') ?? '');
    assert.deepEqual(verifyToken(token), { guildId: 'g1', userId: '123', name: 'Simon in Koma' });
    assert.equal((await fetch(`${base}/api/play`, { method: 'POST', headers: auth, body: '{"guild":"g2","game":"mines"}' })).status, 403);
    assert.equal((await fetch(`${base}/api/play`, { method: 'POST', headers: auth, body: '{"guild":"g1","game":"poker"}' })).status, 400);
  });
});

test('login: without a client secret the site has no login', async () => {
  await withApi({ config: { ...SITE, clientSecret: null }, clientId: () => '999', guild: () => null, memberName: async () => null, balance: async () => 0 }, async (base) => {
    assert.equal((await fetch(`${base}/api/login?state=abcdefgh1234`, { redirect: 'manual' })).status, 404);
    assert.equal((await fetch(`${base}/api/me`, { headers: { Origin: SITE.origin } })).status, 404);
  });
});
