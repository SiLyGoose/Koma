import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { DEFAULTS } from '../src/config.js';
import { MINE_TILES } from '../src/constants/index.js';
import { multiplierFor, type MineRun } from '../src/lib/game/mines.js';
import { gameLink, readWebConfig } from '../src/web/config.js';
import { parseClientMessage, type ServerMessage } from '../src/web/mines-protocol.js';
import { findSession, MineSession, type Peer, type SessionDeps } from '../src/web/mines-session.js';
import { playerKey, signToken, verifyToken, type Player } from '../src/web/token.js';
import { claimMiner, releaseMiner } from '../src/services/mines.js';

// ---------------------------------------------------------------------------
// Links

const SIMON: Player = { guildId: 'g1', userId: 'u1', name: 'Simon' };

test('mine web: a token lets its player in until it runs out, and a changed or foreign one lets nobody in', () => {
  const key = randomBytes(32);
  const token = signToken(SIMON, 1000, 5000, key);
  assert.deepEqual(verifyToken(token, 5500, key), SIMON);
  assert.equal(verifyToken(token, 6001, key), null);
  assert.equal(verifyToken(`${token.slice(0, -2)}xx`, 5500, key), null);
  assert.equal(verifyToken(token, 5500, randomBytes(32)), null);
  assert.equal(verifyToken('nonsense', 5500, key), null);
  assert.equal(verifyToken(`${token}.more`, 5500, key), null);
  // Someone else's id swapped into the body breaks the signature.
  const [body, signature] = token.split('.') as [string, string];
  const other = Buffer.from(Buffer.from(body, 'base64url').toString('utf8').replace('u1', 'u2')).toString('base64url');
  assert.equal(verifyToken(`${other}.${signature}`, 5500, key), null);
  // Any name survives the round trip, dots and all.
  const odd = { ...SIMON, name: 'a.b "c" ⛏️' };
  assert.deepEqual(verifyToken(signToken(odd, 1000, 0, key), 10, key), odd);
  assert.equal(playerKey(SIMON), 'g1:u1');
  assert.ok(signToken(SIMON, 1000).length < 300);
});

test('mine web: a member plays one run at a time, in Discord and on the web alike', () => {
  assert.ok(claimMiner('g9', 'u9'));
  assert.equal(claimMiner('g9', 'u9'), false);
  assert.ok(claimMiner('g9', 'u8'));
  releaseMiner('g9', 'u9');
  assert.ok(claimMiner('g9', 'u9'));
  releaseMiner('g9', 'u9');
  releaseMiner('g9', 'u8');
});

test('web: the settings are both there or both left out, and a link carries the token after #', () => {
  assert.equal(readWebConfig({}), null);
  assert.throws(() => readWebConfig({ WEB_URL: 'https://koma-ui.vercel.app' }));
  assert.throws(() => readWebConfig({ WEB_URL: 'http://koma-ui.vercel.app', WEB_API_URL: 'https://koma.duckdns.org' }));
  assert.throws(() => readWebConfig({ WEB_URL: 'https://koma-ui.vercel.app', WEB_API_URL: 'http://koma.duckdns.org' }));
  assert.throws(() => readWebConfig({ WEB_URL: 'https://a.app', WEB_API_URL: 'https://b', WEB_PORT: 'x' }));
  const config = readWebConfig({ WEB_URL: 'https://koma-ui.vercel.app/', WEB_API_URL: 'https://koma.duckdns.org', DS_CLIENT_SECRET: 's3cret' });
  assert.deepEqual(config, {
    siteUrl: 'https://koma-ui.vercel.app',
    origin: 'https://koma-ui.vercel.app',
    apiUrl: 'https://koma.duckdns.org',
    socketUrl: 'wss://koma.duckdns.org',
    port: 8787,
    clientSecret: 's3cret',
  });
  const link = gameLink(config!, 'mines', 'a.b.c');
  assert.equal(link, 'https://koma-ui.vercel.app/games/mines/#t=a.b.c&s=wss%3A%2F%2Fkoma.duckdns.org%2Fmine');
  assert.equal(gameLink(config!, 'pinecraft', 'a.b.c'), 'https://koma-ui.vercel.app/games/pinecraft/#t=a.b.c&s=wss%3A%2F%2Fkoma.duckdns.org%2Fpinecraft');
  assert.ok(link.length < 512); // Discord's limit on a link button
});

test('web: the older MINE_* settings still work', () => {
  const config = readWebConfig({ MINE_WEB_URL: 'https://koma-ui.vercel.app/games/mines', MINE_WS_URL: 'wss://koma.duckdns.org/mine', MINE_WEB_PORT: '9000' });
  assert.deepEqual(config, {
    siteUrl: 'https://koma-ui.vercel.app',
    origin: 'https://koma-ui.vercel.app',
    apiUrl: 'https://koma.duckdns.org',
    socketUrl: 'wss://koma.duckdns.org',
    port: 9000,
    clientSecret: null,
  });
});

test('mine web: only well-formed messages from the page are read', () => {
  assert.deepEqual(parseClientMessage('{"t":"hello","token":"x"}'), { t: 'hello', token: 'x' });
  assert.deepEqual(parseClientMessage('{"t":"pick","index":24,"seq":1}'), { t: 'pick', index: 24, seq: 1 });
  assert.deepEqual(parseClientMessage('{"t":"pick","index":"random","seq":2}'), { t: 'pick', index: 'random', seq: 2 });
  assert.deepEqual(parseClientMessage('{"t":"cashout","seq":7}'), { t: 'cashout', seq: 7 });
  assert.deepEqual(parseClientMessage('{"t":"start","bet":100,"mines":3,"seq":1}'), { t: 'start', bet: 100, mines: 3, seq: 1 });
  assert.deepEqual(parseClientMessage('{"t":"start","bet":"all","mines":24,"seq":2}'), { t: 'start', bet: 'all', mines: 24, seq: 2 });
  for (const bad of [
    '{"t":"start","bet":0,"mines":3,"seq":1}',
    '{"t":"start","bet":1.5,"mines":3,"seq":1}',
    '{"t":"start","bet":"max","mines":3,"seq":1}',
    '{"t":"start","bet":10,"seq":1}',
    '{"t":"start","bet":10,"mines":2.5,"seq":1}',
    '',
    'null',
    '[]',
    '{"t":"pick","index":25,"seq":1}',
    '{"t":"pick","index":-1,"seq":1}',
    '{"t":"pick","index":1.5,"seq":1}',
    '{"t":"pick","seq":1}',
    '{"t":"pick","index":3,"seq":0}',
    '{"t":"move","dir":"up","seq":1}',
    '{"t":"cashout","seq":1.5}',
    '{"t":"hello"}',
    '{"t":"x"}',
  ]) {
    assert.equal(parseClientMessage(bad), null, bad);
  }
});

// ---------------------------------------------------------------------------
// A session

const RULES = { ...DEFAULTS.mine, maxMultiplier: 100 };

/** A round with mines exactly at `at`. */
function runWith(at: readonly number[]): MineRun {
  const mine = Array.from({ length: MINE_TILES }, (_, i) => at.includes(i));
  return { mines: at.length, mine, revealed: mine.map(() => false), gems: 0, multiplier: 1, status: 'playing' };
}

function fakePeer(): Peer & { sent: ServerMessage[]; closed: boolean } {
  const peer = { sent: [] as ServerMessage[], closed: false, send: (m: ServerMessage) => void peer.sent.push(m), close: () => void (peer.closed = true) };
  return peer;
}

function fakeDeps(): SessionDeps & { settled: [string, number | null][]; saved: number[] } {
  const deps = {
    settled: [] as [string, number | null][],
    saved: [] as number[],
    settle: async (runId: string, multiplier: number | null) => {
      deps.settled.push([runId, multiplier]);
      const payout = Math.round(100 * (multiplier ?? 1));
      return { ok: true as const, bet: 100, payout, balance: 1000 + payout };
    },
    save: async (_: string, multiplier: number) => {
      deps.saved.push(multiplier);
      return true;
    },
    renew: async () => {},
  };
  return deps;
}

test('mine web: the page is only told what has been turned over, until the round is over', async () => {
  const deps = fakeDeps();
  const session = new MineSession({ runId: 'r1', player: SIMON, bet: 100, balance: 900, run: runWith([13, 20, 21]), rules: RULES }, deps);
  const peer = fakePeer();
  session.attach(peer);

  const first = peer.sent[0];
  assert.equal(first?.t, 'state');
  if (first?.t !== 'state') return;
  assert.equal(first.seq, 0);
  assert.equal(first.state.player, 'Simon');
  assert.equal(first.state.balance, 900);
  assert.equal(first.state.mines, 3);
  assert.ok(first.state.tiles.every((t) => t === null));
  assert.equal(first.state.next, multiplierFor(RULES, 3, 1));

  await session.handle(peer, { t: 'pick', index: 7, seq: 1 });
  const gem = peer.sent[1];
  assert.equal(gem?.t, 'state');
  if (gem?.t !== 'state') return;
  assert.equal(gem.seq, 1);
  assert.deepEqual(gem.event, { kind: 'gem', index: 7 });
  assert.equal(gem.state.multiplier, 1.1);
  assert.equal(gem.state.cashOut, 110);
  assert.equal(gem.state.tiles[7], 'gem');
  assert.equal(gem.state.tiles[13], null);
  assert.deepEqual(deps.saved, [1.1]);

  // The same tile again changes nothing.
  await session.handle(peer, { t: 'pick', index: 7, seq: 2 });
  assert.equal(peer.sent.at(-1)?.t === 'state' && (peer.sent.at(-1) as { event?: unknown }).event, undefined);

  await session.handle(peer, { t: 'pick', index: 13, seq: 3 });
  const boom = peer.sent.at(-1);
  assert.equal(boom?.t, 'state');
  if (boom?.t !== 'state') return;
  assert.equal(boom.seq, 3);
  assert.deepEqual(boom.event, { kind: 'boom', index: 13 });
  assert.equal(boom.state.status, 'boom');
  assert.deepEqual([boom.state.tiles[20], boom.state.tiles[21], boom.state.tiles[0]], ['mine', 'mine', 'gem']); // everything is shown now
  assert.deepEqual([boom.state.revealed[13], boom.state.revealed[20]], [true, false]);
  assert.equal(boom.state.balance, 1000); // after the payout (0 here)
  assert.deepEqual(deps.settled, [['r1', 0]]);
  assert.deepEqual(await session.ended, { status: 'boom', settled: { ok: true, bet: 100, payout: 0, balance: 1000 } });
  assert.equal(findSession(SIMON), undefined);

  // Nothing more happens once it is over.
  await session.handle(peer, { t: 'pick', index: 0, seq: 4 });
  assert.equal(deps.settled.length, 1);
});

test('mine web: cashing out pays the multiplier (not before the first gem), and only the page attached last is listened to', async () => {
  const deps = fakeDeps();
  const player = { ...SIMON, userId: 'u2' };
  const session = new MineSession({ runId: 'r2', player, bet: 100, balance: 900, run: runWith([0, 1, 2]), rules: RULES }, deps);
  assert.equal(findSession(player), session);
  const first = fakePeer();
  const second = fakePeer();
  session.attach(first);
  await session.handle(first, { t: 'cashout', seq: 1 });
  assert.equal(deps.settled.length, 0); // no gem yet
  await session.handle(first, { t: 'pick', index: 11, seq: 2 });
  session.attach(second, 2);
  assert.equal(second.sent[0]?.t === 'state' && second.sent[0].seq, 2);

  // The old page's messages are ignored.
  await session.handle(first, { t: 'cashout', seq: 3 });
  assert.equal(deps.settled.length, 0);

  await session.handle(second, { t: 'cashout', seq: 3 });
  assert.deepEqual(deps.settled, [['r2', 1.1]]);
  const end = await session.ended;
  assert.equal(end.status, 'cashed');
  assert.equal(end.settled?.payout, 110);
  const last = second.sent.at(-1);
  assert.equal(last?.t === 'state' && last.state.status, 'cashed');
  assert.equal(last?.t === 'state' && last.state.payout, 110);
});

test('mine web: the last gem cashes the round out by itself', async () => {
  const deps = fakeDeps();
  const session = new MineSession({ runId: 'r4', player: { ...SIMON, userId: 'u4' }, bet: 100, balance: 900, run: runWith(Array.from({ length: 24 }, (_, i) => i + 1)), rules: RULES }, deps);
  const peer = fakePeer();
  session.attach(peer);
  await session.handle(peer, { t: 'pick', index: 0, seq: 1 });
  const end = await session.ended;
  assert.equal(end.status, 'done');
  assert.deepEqual(deps.settled, [['r4', 24.75]]);
  const last = peer.sent.at(-1);
  assert.deepEqual(last?.t === 'state' && last.event, { kind: 'cleared' });
});

test('mine web: a round that failed partway is cashed out at what it reached', async () => {
  const deps = fakeDeps();
  deps.save = async () => {
    throw new Error('database down');
  };
  const session = new MineSession({ runId: 'r3', player: { ...SIMON, userId: 'u3' }, bet: 100, balance: 900, run: runWith([0]), rules: RULES }, deps);
  const peer = fakePeer();
  session.attach(peer);
  const errors = console.error;
  console.error = () => {};
  try {
    await session.handle(peer, { t: 'pick', index: 11, seq: 1 });
  } finally {
    console.error = errors;
  }
  const end = await session.ended;
  assert.equal(end.status, 'failed');
  assert.deepEqual(deps.settled, [['r3', multiplierFor(RULES, 1, 1)]]);
});
