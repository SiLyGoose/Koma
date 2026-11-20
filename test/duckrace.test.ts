import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG, DEFAULTS } from '../src/config.js';
import { GROUPS } from '../src/commands/config.js';
import { DUCK_IDS, DUCK_RACE_MARKS, DUCK_RACE_TABLE, DUCKS, TABLE_CHIPS, TEXT } from '../src/constants/index.js';
import { isDuck, parseBets, race, settleBets, totalBet, type Duck } from '../src/lib/game/casino/duckrace.js';
import { lostChips } from '../src/lib/game/casino/table-bets.js';
import { checkConstraints, findSpec } from '../src/lib/settings-spec.js';
import { WATCHABLE } from '../src/protocol/site.js';
import { GAMES } from '../src/web/config.js';
import { online, resetLive } from '../src/web/games/live.js';
import { parseClientMessage, type ServerMessage, type TableState } from '../src/web/games/duckrace/protocol.js';
import { openConnection, type Peer } from '../src/web/games/duckrace/server.js';
import { resetTables, tablesIn, type TableDeps } from '../src/web/games/duckrace/table.js';
import { signToken } from '../src/web/auth/token.js';

// ---------------------------------------------------------------------------
// The rules

test('duck race: four ducks, each with its own name and colour', () => {
  assert.deepEqual([...DUCK_IDS], ['yellow', 'red', 'blue', 'green']);
  assert.equal(new Set(DUCK_IDS.map((d) => DUCKS[d].name)).size, 4);
  assert.equal(new Set(DUCK_IDS.map((d) => DUCKS[d].color)).size, 4);
  for (const d of DUCK_IDS) assert.ok(isDuck(d), d);
  for (const spot of ['purple', 'Yellow', '', 'player', 'red-blue']) assert.ok(!isDuck(spot), spot);
});

test('duck race: a race is run to fit the order drawn, the winner home first and nobody tying', () => {
  for (let i = 0; i < 500; i++) {
    const round = race();
    assert.equal(round.winner, round.order[0]);
    assert.deepEqual([...round.order].sort(), [...DUCK_IDS].sort());
    const finishes = round.order.map((d) => round.splits[d].at(-1)!);
    for (let j = 1; j < finishes.length; j++) assert.ok(finishes[j]! > finishes[j - 1]!, `${round.order[j]} finishes after ${round.order[j - 1]}`);
    assert.equal(finishes.at(-1), 1, 'the last duck home finishes at 1');
    for (const d of DUCK_IDS) {
      const splits = round.splits[d];
      assert.equal(splits.length, DUCK_RACE_MARKS);
      assert.ok(splits[0]! > 0);
      for (let j = 1; j < splits.length; j++) assert.ok(splits[j]! > splits[j - 1]!, 'a duck only goes forward');
    }
  }
  // The same draws, even ones that would tie (every leg the same), still finish one by one.
  const even = race(() => 0);
  assert.equal(even.winner, 'red');
  const finishes = even.order.map((d) => even.splits[d].at(-1)!);
  assert.deepEqual([...finishes].sort((a, b) => a - b), finishes);
  assert.equal(new Set(finishes).size, 4);
});

test('duck race: every duck wins about a quarter of the races', () => {
  const wins: Record<Duck, number> = { yellow: 0, red: 0, blue: 0, green: 0 };
  const races = 8000;
  for (let i = 0; i < races; i++) wins[race().winner] += 1;
  for (const d of DUCK_IDS) assert.ok(Math.abs(wins[d] / races - 0.25) < 0.025, `${d} won ${wins[d]} of ${races}`);
});

test('duck race: a bet on the winner pays its odds, the rest are lost', () => {
  const settled = settleBets({ yellow: 10, red: 25, blue: 0 }, { winner: 'red' }, 2.8);
  assert.deepEqual(
    settled.map((b) => [b.spot, b.outcome, b.returned]),
    [
      ['yellow', 'lose', 0],
      ['red', 'win', 95],
    ],
  );
  assert.equal(lostChips(settled), 10);
  // Over every winner, a bet gets back 3.8 of 4 (the house keeps 5%).
  const back = DUCK_IDS.reduce((sum, winner) => sum + settleBets({ blue: 1000 }, { winner }, 2.8)[0]!.returned, 0);
  assert.equal(back, 3800);
});

test('duck race: chips from the page are read only on ducks, in whole points', () => {
  assert.deepEqual(parseBets({ yellow: 5, red: 0, green: 10 }), { yellow: 5, green: 10 });
  assert.equal(parseBets({ purple: 5 }), null);
  assert.equal(parseBets({ blue: 1.5 }), null);
  assert.equal(parseBets({ blue: -1 }), null);
  assert.equal(totalBet({ yellow: 5, blue: 20 }), 25);
  assert.deepEqual(parseClientMessage('{"t":"bets","seq":1,"bets":{"red":5}}'), { t: 'bets', seq: 1, bets: { red: 5 } });
  assert.equal(parseClientMessage('{"t":"bets","seq":1,"bets":{"banker":5}}'), null);
});

test('duck race: its settings, config page, command and site entry exist', () => {
  assert.deepEqual(DEFAULTS.duckRace, { minBet: 1, maxBet: 10_000, payout: 3 });
  assert.ok(findSpec('duckRace.minBet'));
  assert.ok(findSpec('duckRace.maxBet'));
  assert.ok(findSpec('duckRace.payout'));
  assert.ok(GROUPS.includes('Duck Race'));
  assert.equal(checkConstraints({ ...DEFAULTS, duckRace: { ...DEFAULTS.duckRace, minBet: 50, maxBet: 10 } }), 'duckRace.minBet cannot be higher than duckRace.maxBet');
  assert.deepEqual(GAMES.duckrace, { page: '/games/duckrace', socket: '/duckrace' });
  assert.ok((WATCHABLE as readonly string[]).includes('duckrace'));
  assert.match(TEXT.duckRace.intro('2.8', '10,000'), /2\.8 to 1/);
  assert.match(TEXT.duckRace.intro('2.8', '10,000'), /Yarl, Erlaf, Faruk or Jabin/);
  assert.equal(CONFIG.duckRace.maxBet, 10_000);
});

// ---------------------------------------------------------------------------
// The table: the same machinery as baccarat's (web/games/table/table.ts, tested fully in baccarat-table.test.ts),
// here with the duck race's round.

function fakePeer(): Peer & { got: ServerMessage[]; last: () => TableState } {
  const peer = {
    got: [] as ServerMessage[],
    send: (message: ServerMessage) => void peer.got.push(message),
    close: () => {},
    last: (): TableState => {
      const found = [...peer.got].reverse().find((m) => m.t === 'table');
      assert.ok(found?.t === 'table', 'the page was sent the table');
      return found.state;
    },
  };
  return peer;
}

test('duck race table: everyone sees one race, settled on their own ducks, and the last winners are kept', async () => {
  resetLive();
  resetTables();
  const balances: Record<string, number> = {};
  const winners: Duck[] = ['blue', 'yellow'];
  let timers: { ms: number; run: () => void; off: boolean }[] = [];
  /** Runs the timers due now (each table's betting or showing time up), or `away` the waits for a page gone. */
  const fire = (away = false): void => {
    const waiting = (t: { ms: number }): boolean => t.ms === DUCK_RACE_TABLE.awayMs;
    const due = timers.filter((t) => !t.off && waiting(t) === away);
    timers = timers.filter((t) => !t.off && waiting(t) !== away);
    for (const t of due) t.run();
  };
  const splits = { yellow: [1], red: [1], blue: [1], green: [1] };
  const deps: TableDeps = {
    balance: async () => 1000,
    avatar: (_g, userId) => `https://cdn.example/${userId}.png`,
    deal: () => {
      const winner = winners.shift()!;
      return { winner, order: [winner, ...DUCK_IDS.filter((d) => d !== winner)], splits };
    },
    now: () => 0,
    schedule: (ms, run) => {
      const timer = { ms, run, off: false };
      timers.push(timer);
      return () => void (timer.off = true);
    },
    play: async (_g, userId, bets, deal) => {
      const round = deal();
      const settled = settleBets(bets, round, CONFIG.duckRace.payout);
      const bet = totalBet(bets);
      const payout = settled.reduce((sum, b) => sum + b.returned, 0);
      balances[userId] = (balances[userId] ?? 1000) - bet + payout;
      return { ok: true, round, bets: settled, bet, payout, net: payout - bet, balance: balances[userId] };
    },
  };
  const join = async (userId: string) => {
    const page = fakePeer();
    const connection = openConnection(page, deps);
    await connection.receive(JSON.stringify({ t: 'hello', token: signToken({ guildId: 'g1', userId, name: userId }, 60_000) }));
    return { page, connection };
  };
  const a = await join('u1');
  const b = await join('u2');
  assert.deepEqual(tablesIn('g1').map((t) => t.players), [2]);
  const first = a.page.last();
  assert.deepEqual([first.maxSeats, first.chips, first.msLeft, first.payout], [8, [...TABLE_CHIPS], DUCK_RACE_TABLE.bettingMs, 3]);

  await a.connection.receive(JSON.stringify({ t: 'bets', seq: 1, bets: { blue: 100, red: 10 } }));
  await b.connection.receive(JSON.stringify({ t: 'bets', seq: 1, bets: { green: 50 } }));
  fire();
  await new Promise((resolve) => setImmediate(resolve));
  const state = a.page.last();
  assert.equal(state.phase, 'dealing');
  assert.deepEqual([state.round?.no, state.round?.winner, state.round?.recent], [1, 'blue', ['blue']]);
  assert.deepEqual(state.seats.map((s) => s.result?.net), [290, -50]);
  assert.equal(online('g1').find((p) => p.userId === 'u1')?.status, 'Table 1 · 2/8 · Faruk wins · +290');

  // The next race remembers the last winner.
  fire();
  await b.connection.receive(JSON.stringify({ t: 'bets', seq: 2, bets: { yellow: 10 } }));
  fire();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(b.page.last().round?.recent, ['yellow', 'blue']);
  assert.equal(b.page.last().seats[1]?.result?.net, 30);
  a.connection.closed();
  b.connection.closed();
  fire(true);
  assert.deepEqual(tablesIn('g1'), []);
});
