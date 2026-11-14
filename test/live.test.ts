import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApi, type ApiDeps, type Leaderboard, type Live } from '../src/web/api.js';
import type { Friends } from '../src/protocol/site.js';
import { signSession } from '../src/web/auth/login.js';
import { townHeroOf } from '../src/web/services/live.js';
import type { WebConfig } from '../src/web/config.js';
import { addWatcher, HUB_TTL_MS, hubSeen, isPlaying, online, playerJoined, playerLeft, removeWatcher, resetLive, toWatchers, type LivePeer } from '../src/web/games/live.js';
import { signToken, signWatchToken, verifyToken, verifyWatchToken } from '../src/web/auth/token.js';

function page(): LivePeer & { got: unknown[]; closed: boolean } {
  const p = { got: [] as unknown[], closed: false, send: (m: unknown) => void p.got.push(m), close: () => void (p.closed = true) };
  return p;
}

test('live: watchers see what the player is sent about the game, starting from the board as it is, and the player sees how many watch', () => {
  resetLive();
  const ZEIU = page();
  const peer = playerJoined('mines', 'g', 'u1', 'ZEIU', ZEIU, (m) => ((m as { t: string }).t === 'lobby' ? 'Picking a bet' : null));
  assert.deepEqual(ZEIU.got, [{ t: 'watchers', count: 0 }]);
  peer.send({ t: 'lobby', lobby: { balance: 5 } });
  peer.send({ t: 'state', seq: 3, state: { gems: 1 } });

  const INU = page();
  assert.deepEqual(addWatcher('mines', 'g', 'u1', INU), { ok: true });
  // Who it is, then the latest board (as if not after any message of theirs).
  assert.deepEqual(INU.got, [{ t: 'watching', player: 'ZEIU' }, { t: 'state', seq: 0, state: { gems: 1 } }]);
  assert.deepEqual(ZEIU.got.at(-1), { t: 'watchers', count: 1 });

  peer.send({ t: 'state', seq: 4, state: { gems: 2 } });
  peer.send({ t: 'error', code: 'bad_message' }); // not the watchers' business
  peer.send({ t: 'map', map: {} }); // they ask for their own
  toWatchers('mines', 'g', 'u1', { t: 'breaking', dir: 'up' });
  assert.deepEqual(INU.got.slice(2), [{ t: 'state', seq: 4, state: { gems: 2 } }, { t: 'breaking', dir: 'up' }]);

  // The player's page goes: watchers are told, and stay for when it's back.
  playerLeft('mines', 'g', 'u1', ZEIU);
  assert.deepEqual(INU.got.at(-1), { t: 'away' });
  assert.equal(isPlaying('mines', 'g', 'u1'), false);
  const again = page();
  playerJoined('mines', 'g', 'u1', 'ZEIU', again).send({ t: 'state', seq: 0, state: { gems: 2 } });
  assert.deepEqual(again.got[0], { t: 'watchers', count: 1 });
  assert.deepEqual(INU.got.at(-1), { t: 'state', seq: 0, state: { gems: 2 } });

  removeWatcher('mines', 'g', 'u1', INU);
  assert.deepEqual(again.got.at(-1), { t: 'watchers', count: 0 });
});

test('live: nobody to watch when nobody is playing, and only so many at once', () => {
  resetLive();
  assert.deepEqual(addWatcher('pinecraft', 'g', 'u1', page()), { ok: false, reason: 'not_playing' });
  playerJoined('pinecraft', 'g', 'u1', 'ZEIU', page());
  for (let i = 0; i < 20; i++) assert.equal(addWatcher('pinecraft', 'g', 'u1', page()).ok, true);
  assert.deepEqual(addWatcher('pinecraft', 'g', 'u1', page()), { ok: false, reason: 'full' });
});

test('live: who is online in a server, in a game or on the front page, with what they are doing', () => {
  resetLive();
  const peer = playerJoined('pinecraft', 'g', 'u1', 'ZEIU', page(), () => 'At 3,4 · 10 dug');
  peer.send({ t: 'state' });
  addWatcher('pinecraft', 'g', 'u1', page());
  hubSeen('g', 'u2', 'INU', 1000);
  hubSeen('g', 'u1', 'ZEIU', 1000); // in a game too: the game is what shows
  hubSeen('other', 'u3', 'HXLON', 1000);
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
  const viewer = { guildId: 'g', userId: 'u2', name: 'INU' };
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

async function withApi(run: (base: string) => Promise<void>, extra: Partial<ApiDeps> = {}): Promise<void> {
  const deps: ApiDeps = {
    config: SITE,
    clientId: () => '1',
    guild: (id) => (id === 'g' ? { name: 'Friends', icon: null } : null),
    memberName: async () => 'INU',
    balance: async () => 0,
    avatar: (_, userId) => (userId === 'u1' ? 'https://cdn/ZEIU.png' : null),
    ...extra,
  };
  const server: Server = createServer(createApi(deps));
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
  playerJoined('mines', 'g', 'u1', 'ZEIU', page(), () => '100 on 3 💣 · 1.10x').send({ t: 'state' });
  const INU = signToken({ guildId: 'g', userId: 'u2', name: 'INU' }, 60_000);
  const headers = { Origin: SITE.origin, Authorization: `Game ${INU}`, 'Content-Type': 'application/json' };
  await withApi(async (base) => {
    const live = (await (await fetch(`${base}/api/live`, { headers })).json()) as Live;
    assert.equal(live.you, 'u2');
    assert.deepEqual(
      live.players.map(({ userId, name, avatar, activity, status, watchable }) => ({ userId, name, avatar, activity, status, watchable })),
      [{ userId: 'u1', name: 'ZEIU', avatar: 'https://cdn/ZEIU.png', activity: 'mines', status: '100 on 3 💣 · 1.10x', watchable: true }],
    );
    // Someone in a game that can't be watched (a raid, poker: /api/watch refuses it) has no Watch.
    playerJoined('technomagic', 'g', 'u3', 'HXLON', page(), () => null).send({ t: 'state' });
    playerJoined('poker', 'g', 'u4', 'MOCHI', page(), () => null).send({ t: 'state' });
    const more = (await (await fetch(`${base}/api/live`, { headers })).json()) as Live;
    assert.deepEqual(
      more.players.map(({ userId, watchable }) => [userId, watchable]).sort(),
      [['u1', true], ['u3', false], ['u4', false]],
    );
    assert.equal((await fetch(`${base}/api/watch`, { method: 'POST', headers, body: JSON.stringify({ game: 'technomagic', target: 'u3' }) })).status, 400);
    const watch = await fetch(`${base}/api/watch`, { method: 'POST', headers, body: JSON.stringify({ game: 'mines', target: 'u1' }) });
    const { url } = (await watch.json()) as { url: string };
    assert.ok(url.startsWith('https://site/games/mines/#w='));
    const token = decodeURIComponent(new URLSearchParams(new URL(url).hash.slice(1)).get('w') ?? '');
    assert.deepEqual(verifyWatchToken(token), { viewer: { guildId: 'g', userId: 'u2', name: 'INU' }, targetId: 'u1' });
    // Not someone who isn't playing that game, and not yourself.
    assert.equal((await fetch(`${base}/api/watch`, { method: 'POST', headers, body: JSON.stringify({ game: 'pinecraft', target: 'u1' }) })).status, 409);
    assert.equal((await fetch(`${base}/api/watch`, { method: 'POST', headers, body: JSON.stringify({ game: 'mines', target: 'u2' }) })).status, 400);
    assert.equal((await fetch(`${base}/api/live`, { headers: { Origin: SITE.origin, Authorization: 'Game nonsense' } })).status, 401);
  });
});

test('live api: the Pinecraft leaderboard, by blocks dug or coins earned, with where the one asking stands', async () => {
  const asked: string[] = [];
  const leaderboard: ApiDeps['leaderboard'] = async (guildId, stat, userId) => {
    asked.push(`${guildId} ${stat} ${userId}`);
    return stat === 'dug'
      ? { top: [{ userId: 'u1', value: 900 }, { userId: 'u2', value: 300 }], you: { userId: 'u2', value: 300, rank: 2 } }
      : { top: [{ userId: 'u1', value: 5000 }], you: { userId: 'u2', value: 0, rank: 2 } };
  };
  const INU = signToken({ guildId: 'g', userId: 'u2', name: 'INU' }, 60_000);
  const headers = { Origin: SITE.origin, Authorization: `Game ${INU}` };
  await withApi(
    async (base) => {
      const dug = (await (await fetch(`${base}/api/pinecraft/leaderboard?stat=dug`, { headers })).json()) as Leaderboard;
      assert.deepEqual(dug, {
        stat: 'dug',
        rows: [
          { rank: 1, userId: 'u1', name: 'INU', avatar: 'https://cdn/ZEIU.png', value: 900 },
          { rank: 2, userId: 'u2', name: 'INU', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png', value: 300 },
        ],
        you: { rank: 2, value: 300 },
      });
      const earned = (await (await fetch(`${base}/api/pinecraft/leaderboard?stat=earned`, { headers })).json()) as Leaderboard;
      assert.deepEqual(earned.rows.map((r) => [r.rank, r.userId, r.value]), [[1, 'u1', 5000]]);
      assert.deepEqual(earned.you, { rank: 2, value: 0 });
      assert.equal((await fetch(`${base}/api/pinecraft/leaderboard?stat=gems`, { headers })).status, 400);
      assert.deepEqual(asked, ['g dug u2', 'g earned u2']);
    },
    { leaderboard },
  );
});

test('friends: the hero a member walks the town as, else the first of theirs by name, else Roi', () => {
  assert.equal(townHeroOf(undefined), 'roi');
  assert.equal(townHeroOf({ userId: 'u', heroes: [], townHero: null }), 'roi');
  assert.equal(townHeroOf({ userId: 'u', heroes: ['klaus', 'kirze'], townHero: null }), 'kirze');
  assert.equal(townHeroOf({ userId: 'u', heroes: ['klaus', 'kirze'], townHero: 'klaus' }), 'klaus');
  // One they don't own any more (sold, or another server's), or one the bot doesn't know: as if none said.
  assert.equal(townHeroOf({ userId: 'u', heroes: ['klaus', 'kirze'], townHero: 'roi' }), 'kirze');
  assert.equal(townHeroOf({ userId: 'u', heroes: ['nobody'], townHero: 'nobody' }), 'roi');
});

test('friends api: everyone in the server with a hero, those on the site first with what they do, the rest by name; members who left left out', async () => {
  resetLive();
  playerJoined('mines', 'g', 'u1', 'ZEIU', page(), () => '100 on 3 💣').send({ t: 'state' });
  // On the site but with no hero (never in the town): left out, as default Roi.
  playerJoined('mines', 'g', 'u5', 'Pip', page(), () => '0 on 1 💣').send({ t: 'state' });
  const kept: string[] = [];
  const friends: ApiDeps['friends'] = {
    members: async () => [
      { userId: 'u1', heroes: ['kirze'], townHero: null },
      { userId: 'u3', heroes: ['kirze', 'klaus'], townHero: 'klaus' },
      { userId: 'u4', heroes: [], townHero: null },
      { userId: 'gone', heroes: ['kirze'], townHero: null },
    ],
    townHero: async (guildId, userId, hero) => (kept.push(`${guildId} ${userId} ${hero}`), hero === 'kirze'),
  };
  const names: Record<string, string> = { u2: 'INU', u3: 'mochi', u4: 'Bao', u5: 'Pip' };
  const session = signSession({ userId: 'u2', name: 'INU', avatar: null, guildIds: ['g'] }, 'shh');
  const headers = { Origin: SITE.origin, Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' };
  await withApi(
    async (base) => {
      const list = (await (await fetch(`${base}/api/friends?guild=g`, { headers })).json()) as Friends;
      assert.equal(list.you, 'u2');
      assert.deepEqual(
        list.friends.map(({ userId, name, hero, online }) => [userId, name, hero, online?.activity ?? null]),
        [
          ['u1', 'ZEIU', 'kirze', 'mines'],
          // Asking is being on the site (the town), with no hero: Roi.
          ['u2', 'INU', 'roi', 'hub'],
          // u4 has no hero (default Roi): left out.
          ['u3', 'mochi', 'klaus', null],
        ],
      );
      const hero = (body: object) => fetch(`${base}/api/friends/hero`, { method: 'POST', headers, body: JSON.stringify(body) });
      assert.equal((await hero({ guild: 'g', hero: 'kirze' })).status, 204);
      assert.equal((await hero({ guild: 'g', hero: 'klaus' })).status, 404);
      assert.equal((await hero({ guild: 'other', hero: 'kirze' })).status, 403);
      assert.deepEqual(kept, ['g u2 kirze', 'g u2 klaus']);
      // Watching: Mines can be, the town can't, nor can the one asking be.
      assert.deepEqual(list.friends.map((f) => f.online?.watchable ?? null), [true, false, null]);
    },
    { friends, memberName: async (_g, userId) => names[userId] ?? null },
  );
});
