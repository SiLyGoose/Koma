import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BACCARAT_TABLE } from '../src/constants/index.js';
import { dealRound, parseBets, settleBets, totalBet, type BaccaratPayouts } from '../src/lib/game/baccarat.js';
import type { Card } from '../src/lib/game/blackjack.js';
import { parseClientMessage, type ServerMessage, type TableState } from '../src/web/baccarat-protocol.js';
import { openConnection, type Peer } from '../src/web/baccarat-server.js';
import { resetTables, tablesIn, type TableDeps } from '../src/web/baccarat-table.js';
import { online, resetLive } from '../src/web/live.js';
import { signToken } from '../src/web/token.js';

const PAYOUTS: BaccaratPayouts = { banker: 0.95, tie: 8, kirin: 25, phoenix: 40 };
/** A card worth `points` (0 is a king). */
const c = (points: number): Card => ({ rank: points === 0 ? 13 : points, suit: 'spades' });
/** A shoe dealt in this order: Player, Banker, Player, Banker, then any third cards. */
const shoe = (...points: number[]): Card[] => [...points.map(c), c(0), c(0)];

test('baccarat web: only well-formed messages from the page are read', () => {
  assert.deepEqual(parseClientMessage('{"t":"hello","token":"a.b"}'), { t: 'hello', token: 'a.b' });
  assert.deepEqual(parseClientMessage('{"t":"bets","seq":1,"bets":{"banker":100,"kirin":10,"tie":0}}'), { t: 'bets', seq: 1, bets: { banker: 100, kirin: 10 } });
  assert.deepEqual(parseClientMessage('{"t":"bets","seq":2,"bets":{}}'), { t: 'bets', seq: 2, bets: {} }, 'every chip taken back');
  for (const bad of [
    '',
    '{"t":"bets","seq":1,"bets":{"dragon":10}}',
    '{"t":"bets","seq":1,"bets":{"player":-5}}',
    '{"t":"bets","seq":1,"bets":{"player":1.5}}',
    '{"t":"bets","seq":0,"bets":{"player":5}}',
    '{"t":"bets","bets":{"player":5}}',
  ]) {
    assert.equal(parseClientMessage(bad), null, bad);
  }
  assert.equal(parseBets([10]), null);
});

function fakePeer(): Peer & { got: ServerMessage[]; closed: boolean; last: () => TableState } {
  const peer = {
    got: [] as ServerMessage[],
    closed: false,
    send: (message: ServerMessage) => void peer.got.push(message),
    close: () => void (peer.closed = true),
    last: (): TableState => {
      const found = [...peer.got].reverse().find((m) => m.t === 'table');
      assert.ok(found?.t === 'table', 'the page was sent the table');
      return found.state;
    },
  };
  return peer;
}

/** A table with a fake clock, fake timers (fired by `tick`), fake balances, and every round dealt from `cards`. */
function fakeTable(cards: number[], balances: Record<string, number> = {}) {
  const clock = { now: 0 };
  let timers: { at: number; run: () => void; off: boolean }[] = [];
  const played: [string, number][] = [];
  const balance = (userId: string): number => balances[userId] ?? 1000;
  const deps: TableDeps = {
    balance: async (_g, userId) => balance(userId),
    avatar: (_g, userId) => `https://cdn.example/${userId}.png`,
    deal: () => dealRound(shoe(...cards)),
    now: () => clock.now,
    schedule: (ms, run) => {
      const timer = { at: clock.now + ms, run, off: false };
      timers.push(timer);
      return () => void (timer.off = true);
    },
    // The real settling, on the fake balances (no database).
    play: async (_g, userId, bets, deal) => {
      const round = deal!();
      const bet = totalBet(bets);
      if (bet > balance(userId)) return { ok: false, reason: 'too_poor', balance: balance(userId) };
      const settled = settleBets(bets, round, PAYOUTS);
      const payout = settled.reduce((sum, b) => sum + b.returned, 0);
      balances[userId] = balance(userId) - bet + payout;
      played.push([userId, bet]);
      return { ok: true, round, bets: settled, bet, payout, net: payout - bet, balance: balances[userId] };
    },
  };
  /** Moves the clock on by `ms`, firing the timers that come due. */
  const tick = async (ms: number): Promise<void> => {
    clock.now += ms;
    for (const timer of timers.filter((t) => !t.off && t.at <= clock.now)) {
      timer.off = true;
      timer.run();
    }
    timers = timers.filter((t) => !t.off);
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { deps, tick, played, balances };
}

/** Seats a player: their page, and the connection it talks through. */
async function join(deps: TableDeps, userId: string, name: string, guildId = 'g1') {
  const page = fakePeer();
  const connection = openConnection(page, deps);
  await connection.receive(JSON.stringify({ t: 'hello', token: signToken({ guildId, userId, name }, 60_000) }));
  return { page, connection };
}

const bets = (seq: number, chips: Record<string, number>): string => JSON.stringify({ t: 'bets', seq, bets: chips });

test('baccarat table: players are seated together, up to 8 a table, and see each other with their pictures and balances', async () => {
  resetLive();
  resetTables();
  const { deps } = fakeTable([4, 3, 4, 3], { u1: 500 });
  const players = [];
  const seats = BACCARAT_TABLE.seats;
  assert.equal(seats, 8);
  for (let i = 1; i <= seats + 1; i++) players.push(await join(deps, `u${i}`, `P${i}`));
  const first = players[0]!;
  const state = first.page.last();
  assert.equal(state.table, 1);
  assert.equal(state.maxSeats, BACCARAT_TABLE.seats);
  assert.deepEqual(state.seats.map((s) => s.userId), Array.from({ length: seats }, (_, i) => `u${i + 1}`), 'one more went to another table');
  assert.deepEqual(state.seats[0], { userId: 'u1', name: 'P1', avatar: 'https://cdn.example/u1.png', balance: 500, bets: {}, result: null, refused: false, lastBets: null });
  assert.equal(state.phase, 'betting');
  assert.equal(state.msLeft, BACCARAT_TABLE.bettingMs);
  assert.equal(players[seats]!.page.last().table, 2);
  assert.deepEqual(tablesIn('g1').map((t) => t.players), [seats, 1]);
  assert.equal(online('g1').find((p) => p.userId === 'u1')?.status, `Table 1 · ${seats}/${seats} · Placing chips`);

  // Someone leaves: the next newcomer takes their seat.
  players[2]!.connection.closed();
  assert.deepEqual(first.page.last().seats.map((s) => s.userId), Array.from({ length: seats }, (_, i) => `u${i + 1}`).filter((u) => u !== 'u3'));
  const late = await join(deps, 'late', 'Late');
  assert.equal(late.page.last().table, 1);
  for (const p of [...players, late]) p.connection.closed();
  assert.deepEqual(tablesIn('g1'), [], 'empty tables close');
});

test('baccarat table: chips show to everyone as they go down, within the limit and the balance', async () => {
  resetLive();
  resetTables();
  const { deps } = fakeTable([4, 3, 4, 3], { u2: 50 });
  const a = await join(deps, 'u1', 'Simon');
  const b = await join(deps, 'u2', 'Alvin');
  await a.connection.receive(bets(1, { banker: 100, kirin: 10 }));
  assert.deepEqual(b.page.last().seats.find((s) => s.userId === 'u1')?.bets, { banker: 100, kirin: 10 }, 'Alvin sees the chips');
  assert.equal(online('g1').find((p) => p.userId === 'u1')?.status, `Table 1 · 2/${BACCARAT_TABLE.seats} · 110 down`);

  await b.connection.receive(bets(1, { player: 60 }));
  assert.deepEqual(b.page.got.find((m) => m.t === 'refused'), { t: 'refused', seq: 1, reason: 'too_poor', balance: 50 });
  await a.connection.receive(bets(2, { player: 10_001 }));
  assert.deepEqual(a.page.got.find((m) => m.t === 'refused'), { t: 'refused', seq: 2, reason: 'too_big', limit: 10_000 });
  assert.deepEqual(a.page.last().seats[0]?.bets, { banker: 100, kirin: 10 }, 'what is really down is sent back');
  await a.connection.receive(bets(3, {}));
  assert.deepEqual(b.page.last().seats[0]?.bets, {});
  a.connection.closed();
  b.connection.closed();
});

test('baccarat table: when the betting time is up, one round is dealt and everyone is settled on their own chips', async () => {
  resetLive();
  resetTables();
  // Player 8 against Banker 6: a natural.
  const { deps, tick, played, balances } = fakeTable([4, 3, 4, 3], { u1: 1000, u2: 1000, u3: 1000 });
  const a = await join(deps, 'u1', 'Simon');
  const b = await join(deps, 'u2', 'Alvin');
  const t = await join(deps, 'u3', 'Trina');
  await a.connection.receive(bets(1, { player: 100 }));
  await b.connection.receive(bets(1, { banker: 200, tie: 10 }));
  // Trina has no chips down: she sits the round out.
  await tick(BACCARAT_TABLE.bettingMs);
  const state = t.page.last();
  assert.equal(state.phase, 'dealing');
  assert.equal(state.msLeft, BACCARAT_TABLE.showMs);
  assert.deepEqual([state.round?.no, state.round?.winner, state.round?.playerTotal, state.round?.bankerTotal], [1, 'player', 8, 6]);
  const [simon, alvin, trina] = state.seats;
  assert.deepEqual([simon?.result?.net, simon?.balance, simon?.lastBets], [100, 1100, { player: 100 }]);
  assert.deepEqual([alvin?.result?.net, alvin?.balance], [-210, 790]);
  assert.equal(trina?.result, null);
  assert.deepEqual(played, [['u1', 100], ['u2', 210]]);
  assert.deepEqual(balances, { u1: 1100, u2: 790, u3: 1000 });
  assert.match(online('g1').find((p) => p.userId === 'u2')?.status ?? '', /Player wins · −210/);

  // Chips can't go down while the round is shown; then a new round starts with an empty table.
  await a.connection.receive(bets(2, { player: 100 }));
  assert.deepEqual(a.page.got.find((m) => m.t === 'refused'), { t: 'refused', seq: 2, reason: 'closed' });
  await tick(BACCARAT_TABLE.showMs);
  const next = a.page.last();
  assert.equal(next.phase, 'betting');
  assert.deepEqual(next.seats.map((s) => [s.bets, s.result]), [[{}, null], [{}, null], [{}, null]]);
  assert.equal(next.round?.no, 1, 'the last round stays on the table');

  // Nobody bets: the time runs out and the betting just starts over.
  await tick(BACCARAT_TABLE.bettingMs);
  assert.deepEqual([a.page.last().phase, a.page.last().msLeft, played.length], ['betting', BACCARAT_TABLE.bettingMs, 2]);
  for (const p of [a, b, t]) p.connection.closed();
});

test('baccarat table: chips a player can no longer cover are refused at the deal, and the rest still play', async () => {
  resetLive();
  resetTables();
  const { deps, tick, balances } = fakeTable([4, 3, 4, 3], { u1: 1000, u2: 1000 });
  const a = await join(deps, 'u1', 'Simon');
  const b = await join(deps, 'u2', 'Alvin');
  await a.connection.receive(bets(1, { player: 800 }));
  await b.connection.receive(bets(1, { player: 100 }));
  balances.u1 = 300; // spent in Discord meanwhile
  await tick(BACCARAT_TABLE.bettingMs);
  const [simon, alvin] = b.page.last().seats;
  assert.deepEqual([simon?.refused, simon?.result, simon?.balance], [true, null, 300]);
  assert.deepEqual([alvin?.refused, alvin?.result?.net], [false, 100]);
  a.connection.closed();
  b.connection.closed();
});

test('baccarat table: a new page takes over the seat, and a bad message or token hangs up', async () => {
  resetLive();
  resetTables();
  const { deps } = fakeTable([4, 3, 4, 3]);
  const first = await join(deps, 'u1', 'Simon');
  const second = await join(deps, 'u1', 'Simon');
  assert.deepEqual(first.page.got.at(-1), { t: 'error', code: 'replaced' });
  assert.equal(first.page.closed, true);
  assert.deepEqual(second.page.last().seats.map((s) => s.userId), ['u1'], 'still one seat');
  first.connection.closed();
  assert.equal(tablesIn('g1')[0]?.players, 1, 'the old page going away leaves the seat alone');

  await second.connection.receive('{"t":"bets","seq":1,"bets":{"dragon":1}}');
  assert.deepEqual([second.page.got.at(-1), second.page.closed], [{ t: 'error', code: 'bad_message' }, true]);
  second.connection.closed();

  const stranger = fakePeer();
  const other = openConnection(stranger, deps);
  await other.receive(JSON.stringify({ t: 'hello', token: 'not.a-token' }));
  assert.deepEqual([stranger.got.at(-1), stranger.closed], [{ t: 'error', code: 'bad_token' }, true]);
  other.closed();
});
