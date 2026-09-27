import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { handleApi, type ApiDeps, type Live } from '../src/web/api.js';
import type { WebConfig } from '../src/web/config.js';
import { addWatcher, HUB_TTL_MS, hubSeen, isPlaying, online, playerJoined, playerLeft, removeWatcher, resetLive, toWatchers, type LivePeer } from '../src/web/live.js';
import { signToken, signWatchToken, verifyToken, verifyWatchToken } from '../src/web/token.js';

function page(): LivePeer & { got: unknown[]; closed: boolean } {
  const p = { got: [] as unknown[], closed: false, send: (m: unknown) => void p.got.push(m), close: () => void (p.closed = true) };
  return p;
}

test('live: watchers see what the player is sent about the game, starting from the board as it is, and the player sees how many watch', () => {
  resetLive();
  const simon = page();
  const peer = playerJoined('mines', 'g', 'u1', 'Simon', simon, (m) => ((m as { t: string }).t === 'lobby' ? 'Picking a bet' : null));
  assert.deepEqual(simon.got, [{ t: 'watchers', count: 0 }]);
  peer.send({ t: 'lobby', lobby: { balance: 5 } });
  peer.send({ t: 'state', seq: 3, state: { gems: 1 } });

  const alvin = page();
  assert.deepEqual(addWatcher('mines', 'g', 'u1', alvin), { ok: true });
  // Who it is, then the latest board (as if not after any message of theirs).
  assert.deepEqual(alvin.got, [{ t: 'watching', player: 'Simon' }, { t: 'state', seq: 0, state: { gems: 1 } }]);
  assert.deepEqual(simon.got.at(-1), { t: 'watchers', count: 1 });

  peer.send({ t: 'state', seq: 4, state: { gems: 2 } });
  peer.send({ t: 'error', code: 'bad_message' }); // not the watchers' business
  peer.send({ t: 'map', map: {} }); // they ask for their own
  toWatchers('mines', 'g', 'u1', { t: 'breaking', dir: 'up' });
  assert.deepEqual(alvin.got.slice(2), [{ t: 'state', seq: 4, state: { gems: 2 } }, { t: 'breaking', dir: 'up' }]);

  // The player's page goes: watchers are told, and stay for when it's back.
  playerLeft('mines', 'g', 'u1', simon);
  assert.deepEqual(alvin.got.at(-1), { t: 'away' });
  assert.equal(isPlaying('mines', 'g', 'u1'), false);
  const again = page();
  playerJoined('mines', 'g', 'u1', 'Simon', again).send({ t: 'state', seq: 0, state: { gems: 2 } });
  assert.deepEqual(again.got[0], { t: 'watchers', count: 1 });
  assert.deepEqual(alvin.got.at(-1), { t: 'state', seq: 0, state: { gems: 2 } });

  removeWatcher('mines', 'g', 'u1', alvin);
  assert.deepEqual(again.got.at(-1), { t: 'watchers', count: 0 });
});

test('live: nobody to watch when nobody is playing, and only so many at once', () => {
  resetLive();
  assert.deepEqual(addWatcher('pinecraft', 'g', 'u1', page()), { ok: false, reason: 'not_playing' });
  playerJoined('pinecraft', 'g', 'u1', 'Simon', page());
  for (let i = 0; i < 20; i++) assert.equal(addWatcher('pinecraft', 'g', 'u1', page()).ok, true);
  assert.deepEqual(addWatcher('pinecraft', 'g', 'u1', page()), { ok: false, reason: 'full' });
});

test('live: who is online in a server, in a game or on the front page, with what they are doing', () => {
  resetLive();
  const peer = playerJoined('pinecraft', 'g', 'u1', 'Simon', page(), () => 'At 3,4 · 10 dug');
  peer.send({ t: 'state' });
  addWatcher('pinecraft', 'g', 'u1', page());
  hubSeen('g', 'u2', 'Alvin', 1000);
  hubSeen('g', 'u1', 'Simon', 1000); // in a game too: the game is what shows
  hubSeen('other', 'u3', 'Helen', 1000);
  const now = online('g', 2000).sort((a, b) => a.userId.localeCompare(b.userId));
  assert.deepEqual(
    now.map((p) => [p.userId, p.activity, p.status, p.watchers]),
    [
      ['u1', 'pinecraft', 'At 3,4 · 10 dug', 1],
      ['u2', 'hub', '', 0],
    ],
  );
  // The front page stops counting a while after it last asked.
  assert.deepEqual(
    online('g', 1000 + HUB_TTL_MS).map((p) => p.userId),
    ['u1'],
  );
});

test('live: a watch token only lets its holder watch, and a play token only play', () => {
  const viewer = { guildId: 'g', userId: 'u2', name: 'Alvin' };
  const watch = signWatchToken({ viewer, targetId: 'u1' }, 60_000);
  assert.deepEqual(verifyWatchToken(watch), { viewer, targetId: 'u1' });
  assert.equal(verifyToken(watch), null);
  const play = signToken(viewer, 60_000);
  assert.equal(verifyWatchToken(play), null);
  assert.deepEqual(verifyToken(play), viewer);
});

// ---------------------------------------------------------------------------
// The API

const SITE: WebConfig = { siteUrl: 'https://site', origin: 'https://site', apiUrl: 'https://bot', socketUrl: 'wss://bot', port: 0, clientSecret: 'shh' };

async function withApi(run: (base: string) => Promise<void>): Promise<void> {
  const deps: ApiDeps = {
    config: SITE,
    clientId: () => '1',
    guild: (id) => (id === 'g' ? { name: 'Friends', icon: null } : null),
    memberName: async () => 'Alvin',
    balance: async () => 0,
    avatar: (_, userId) => (userId === 'u1' ? 'https://cdn/simon.png' : null),
  };
  const server: Server = createServer((req, res) => void handleApi(req, res, deps).then((handled) => (handled ? undefined : res.writeHead(404).end())));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('live api: a game page lists who is online with its own link, and gets a link to watch someone playing', async () => {
  resetLive();
  playerJoined('mines', 'g', 'u1', 'Simon', page(), () => '100 on 3 💣 · 1.10x').send({ t: 'state' });
  const alvin = signToken({ guildId: 'g', userId: 'u2', name: 'Alvin' }, 60_000);
  const headers = { Origin: SITE.origin, Authorization: `Game ${alvin}`, 'Content-Type': 'application/json' };
  await withApi(async (base) => {
    const live = (await (await fetch(`${base}/api/live`, { headers })).json()) as Live;
    assert.equal(live.you, 'u2');
    assert.deepEqual(
      live.players.map(({ userId, name, avatar, activity, status, watchable }) => ({ userId, name, avatar, activity, status, watchable })),
      [{ userId: 'u1', name: 'Simon', avatar: 'https://cdn/simon.png', activity: 'mines', status: '100 on 3 💣 · 1.10x', watchable: true }],
    );
    const watch = await fetch(`${base}/api/watch`, { method: 'POST', headers, body: JSON.stringify({ game: 'mines', target: 'u1' }) });
    const { url } = (await watch.json()) as { url: string };
    assert.ok(url.startsWith('https://site/games/mines/#w='));
    const token = decodeURIComponent(new URLSearchParams(new URL(url).hash.slice(1)).get('w') ?? '');
    assert.deepEqual(verifyWatchToken(token), { viewer: { guildId: 'g', userId: 'u2', name: 'Alvin' }, targetId: 'u1' });
    // Not someone who isn't playing that game, and not yourself.
    assert.equal((await fetch(`${base}/api/watch`, { method: 'POST', headers, body: JSON.stringify({ game: 'pinecraft', target: 'u1' }) })).status, 409);
    assert.equal((await fetch(`${base}/api/watch`, { method: 'POST', headers, body: JSON.stringify({ game: 'mines', target: 'u2' }) })).status, 400);
    assert.equal((await fetch(`${base}/api/live`, { headers: { Origin: SITE.origin, Authorization: 'Game nonsense' } })).status, 401);
  });
});
