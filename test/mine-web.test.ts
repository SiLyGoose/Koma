import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { DEFAULTS } from '../src/config.js';
import { CENTER, TILE_COUNT, type MineRun, type MineTile } from '../src/lib/game/mine.js';
import { readMineWebConfig, playLink } from '../src/web/config.js';
import { parseClientMessage, type ServerMessage } from '../src/web/mine-protocol.js';
import { findSession, MineSession, type Peer, type SessionDeps } from '../src/web/mine-session.js';
import { playerKey, signToken, verifyToken, type Player } from '../src/web/token.js';
import { claimMiner, releaseMiner } from '../src/services/mine.js';

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

test('mine web: the settings are both there or both left out, and the link carries the token after #', () => {
  assert.equal(readMineWebConfig({}), null);
  assert.throws(() => readMineWebConfig({ MINE_WEB_URL: 'https://koma-ui.vercel.app' }));
  assert.throws(() => readMineWebConfig({ MINE_WEB_URL: 'http://koma-ui.vercel.app', MINE_WS_URL: 'wss://koma.duckdns.org/mine' }));
  assert.throws(() => readMineWebConfig({ MINE_WEB_URL: 'https://koma-ui.vercel.app', MINE_WS_URL: 'ws://koma.duckdns.org/mine' }));
  assert.throws(() => readMineWebConfig({ MINE_WEB_URL: 'https://a.app', MINE_WS_URL: 'wss://b/mine', MINE_WEB_PORT: 'x' }));
  const config = readMineWebConfig({ MINE_WEB_URL: 'https://koma-ui.vercel.app/', MINE_WS_URL: 'wss://koma.duckdns.org/mine' });
  assert.deepEqual(config, { pageUrl: 'https://koma-ui.vercel.app', origin: 'https://koma-ui.vercel.app', socketUrl: 'wss://koma.duckdns.org/mine', port: 8787 });
  const link = playLink(config!, 'a.b.c');
  assert.equal(link, 'https://koma-ui.vercel.app/#t=a.b.c&s=wss%3A%2F%2Fkoma.duckdns.org%2Fmine');
  assert.ok(link.length < 512); // Discord's limit on a link button
});

test('mine web: only well-formed messages from the page are read', () => {
  assert.deepEqual(parseClientMessage('{"t":"hello","token":"x"}'), { t: 'hello', token: 'x' });
  assert.deepEqual(parseClientMessage('{"t":"move","dir":"up","seq":1}'), { t: 'move', dir: 'up', seq: 1 });
  assert.deepEqual(parseClientMessage('{"t":"cashout","seq":7}'), { t: 'cashout', seq: 7 });
  assert.deepEqual(parseClientMessage('{"t":"start","bet":100,"seq":1}'), { t: 'start', bet: 100, seq: 1 });
  assert.deepEqual(parseClientMessage('{"t":"start","bet":"all","seq":2}'), { t: 'start', bet: 'all', seq: 2 });
  for (const bad of ['{"t":"start","bet":0,"seq":1}', '{"t":"start","bet":1.5,"seq":1}', '{"t":"start","bet":"max","seq":1}', '{"t":"start","bet":10}', '', 'null', '[]', '{"t":"move","dir":"north","seq":1}', '{"t":"move","dir":"up"}', '{"t":"move","dir":"up","seq":0}', '{"t":"cashout","seq":1.5}', '{"t":"hello"}', '{"t":"x"}']) {
    assert.equal(parseClientMessage(bad), null, bad);
  }
});

// ---------------------------------------------------------------------------
// A session

const RULES = DEFAULTS.mine;

/** A run on a hand-made field: everything rock except `tiles`, the miner in the middle. */
function runWith(tiles: Record<number, MineTile>, oresLeft: number): MineRun {
  const all = Array.from({ length: TILE_COUNT }, (_, i) => tiles[i] ?? ({ kind: 'rock' } as MineTile));
  return { tiles: all, dug: all.map((_, i) => i === CENTER), pos: CENTER, field: 1, multiplier: 1, oresLeft, status: 'digging' };
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

test('mine web: the page is only told what has been dug, until the run is over', async () => {
  const deps = fakeDeps();
  const run = runWith({ 7: { kind: 'ore', ore: 'gold' }, 13: { kind: 'dynamite' }, 0: { kind: 'ore', ore: 'diamond' } }, 2);
  const session = new MineSession({ runId: 'r1', player: SIMON, bet: 100, balance: 900, run, rules: RULES }, deps);
  const peer = fakePeer();
  session.attach(peer);

  const first = peer.sent[0];
  assert.equal(first?.t, 'state');
  if (first?.t !== 'state') return;
  assert.equal(first.seq, 0);
  assert.equal(first.state.player, 'Simon');
  assert.equal(first.state.balance, 900);
  assert.deepEqual(first.state.tiles.filter((t) => t !== null), ['rock']);
  assert.equal(first.state.tiles[13], null);
  assert.equal(first.state.tiles[7], null);

  await session.handle(peer, { t: 'move', dir: 'up', seq: 1 });
  const dug = peer.sent[1];
  assert.equal(dug?.t, 'state');
  if (dug?.t !== 'state') return;
  assert.equal(dug.seq, 1);
  assert.deepEqual(dug.event, { kind: 'ore', ore: 'gold', gained: 0.5 });
  assert.equal(dug.state.multiplier, 1.5);
  assert.equal(dug.state.cashOut, 150);
  assert.equal(dug.state.tiles[7], 'gold');
  assert.equal(dug.state.tiles[13], null);
  assert.deepEqual(deps.saved, [1.5]);

  await session.handle(peer, { t: 'move', dir: 'down', seq: 2 });
  await session.handle(peer, { t: 'move', dir: 'right', seq: 3 });
  const boom = peer.sent.at(-1);
  assert.equal(boom?.t, 'state');
  if (boom?.t !== 'state') return;
  assert.equal(boom.seq, 3);
  assert.deepEqual(boom.event, { kind: 'boom' });
  assert.equal(boom.state.status, 'boom');
  assert.equal(boom.state.tiles[0], 'diamond'); // everything is shown now
  assert.equal(boom.state.balance, 1000); // after the payout (0 here)
  assert.deepEqual(deps.settled, [['r1', 0]]);
  assert.deepEqual(await session.ended, { status: 'boom', settled: { ok: true, bet: 100, payout: 0, balance: 1000 } });
  assert.equal(findSession(SIMON), undefined);

  // Nothing more happens once it is over.
  await session.handle(peer, { t: 'move', dir: 'left', seq: 4 });
  assert.equal(deps.settled.length, 1);
});

test('mine web: cashing out pays the multiplier, and only the page attached last is listened to', async () => {
  const deps = fakeDeps();
  const player = { ...SIMON, userId: 'u2' };
  const session = new MineSession({ runId: 'r2', player, bet: 100, balance: 900, run: runWith({ 11: { kind: 'ore', ore: 'coal' } }, 2), rules: RULES }, deps);
  assert.equal(findSession(player), session);
  const first = fakePeer();
  const second = fakePeer();
  session.attach(first);
  await session.handle(first, { t: 'move', dir: 'left', seq: 1 });
  session.attach(second, 1);
  assert.equal(second.sent[0]?.t === 'state' && second.sent[0].seq, 1);

  // The old page's messages are ignored.
  await session.handle(first, { t: 'cashout', seq: 2 });
  assert.equal(deps.settled.length, 0);

  await session.handle(second, { t: 'cashout', seq: 1 });
  assert.deepEqual(deps.settled, [['r2', 1.1]]);
  const end = await session.ended;
  assert.equal(end.status, 'cashed');
  assert.equal(end.settled?.payout, 110);
  const last = second.sent.at(-1);
  assert.equal(last?.t === 'state' && last.state.status, 'cashed');
  assert.equal(last?.t === 'state' && last.state.payout, 110);
});

test('mine web: a run that failed partway is cashed out at what it reached', async () => {
  const deps = fakeDeps();
  deps.save = async () => {
    throw new Error('database down');
  };
  const session = new MineSession({ runId: 'r3', player: { ...SIMON, userId: 'u3' }, bet: 100, balance: 900, run: runWith({ 11: { kind: 'ore', ore: 'diamond' } }, 2), rules: RULES }, deps);
  const peer = fakePeer();
  session.attach(peer);
  const errors = console.error;
  console.error = () => {};
  try {
    await session.handle(peer, { t: 'move', dir: 'left', seq: 1 });
  } finally {
    console.error = errors;
  }
  const end = await session.ended;
  assert.equal(end.status, 'failed');
  assert.deepEqual(deps.settled, [['r3', 2]]);
});
