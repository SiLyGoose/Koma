import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG, DEFAULTS } from '../src/config.js';
import { GROUPS } from '../src/commands/config.js';
import { ROULETTE_OUTSIDE, ROULETTE_RED, ROULETTE_TABLE, TABLE_CHIPS, TEXT } from '../src/constants/index.js';
import { colorOf, isRouletteSpot, oddsFor, parseBets, ROULETTE_SPOTS, settleBets, spin, totalBet } from '../src/lib/game/casino/roulette.js';
import { lostChips } from '../src/lib/game/casino/table-bets.js';
import { checkConstraints, findSpec } from '../src/lib/settings-spec.js';
import { GAMES } from '../src/web/config.js';
import { online, resetLive } from '../src/web/live.js';
import { parseClientMessage, type ServerMessage, type TableState } from '../src/web/roulette/protocol.js';
import { openConnection, type Peer } from '../src/web/roulette/server.js';
import { resetTables, tablesIn, type TableDeps } from '../src/web/roulette/table.js';
import { signToken } from '../src/web/token.js';

// ---------------------------------------------------------------------------
// The rules

test('roulette: 0 and 00 are green, and 1 to 36 are half red, half black', () => {
  assert.equal(colorOf(0), 'green');
  assert.equal(colorOf('00'), 'green');
  assert.equal(colorOf(1), 'red');
  assert.equal(colorOf(2), 'black');
  assert.equal(colorOf(36), 'red');
  const reds = Array.from({ length: 36 }, (_, i) => i + 1).filter((n) => colorOf(n) === 'red');
  assert.deepEqual(reds, [...ROULETTE_RED]);
  assert.equal(reds.length, 18);
});

test('roulette: the board has every inside bet once, each covering numbers side by side', () => {
  const byCount = new Map<number, number>();
  for (const [spot, numbers] of ROULETTE_SPOTS) {
    if ((ROULETTE_OUTSIDE as readonly string[]).includes(spot)) continue;
    assert.equal(spot, numbers.join('-'), 'an inside spot is named by its numbers');
    byCount.set(numbers.length, (byCount.get(numbers.length) ?? 0) + 1);
  }
  // 38 straights; 57 splits + 0-00, 0-1 and 00-3; 12 streets + 0-1-2, 0-00-2 and 00-2-3; 22 corners; the top line; 11 lines.
  assert.deepEqual(Object.fromEntries(byCount), { 1: 38, 2: 60, 3: 15, 4: 22, 5: 1, 6: 11 });
  for (const spot of ['00', '17', '17-20', '16-17', '16-17-18', '16-17-19-20', '13-14-15-16-17-18', '0-00', '00-3', '0-00-2', '00-2-3', '0-00-1-2-3']) assert.ok(isRouletteSpot(spot), spot);
  for (const spot of ['37', '000', '3-4', '17-21', '1-2-3-4', '15-16-17', '0-1-2-3', '00-1', '', 'green']) assert.ok(!isRouletteSpot(spot), spot);
});

test('roulette: every bet pays 36 over its numbers, less the bet', () => {
  assert.equal(oddsFor('17'), 35);
  assert.equal(oddsFor('17-20'), 17);
  assert.equal(oddsFor('16-17-18'), 11);
  assert.equal(oddsFor('16-17-19-20'), 8);
  assert.equal(oddsFor('13-14-15-16-17-18'), 5);
  assert.equal(oddsFor('0-00-1-2-3'), 6, 'the top line: 36 / 5 - 1, rounded down');
  assert.equal(oddsFor('dozen2'), 2);
  assert.equal(oddsFor('column3'), 2);
  for (const spot of ['red', 'black', 'odd', 'even', 'low', 'high']) assert.equal(oddsFor(spot), 1, spot);
  assert.deepEqual(ROULETTE_SPOTS.get('column1')?.slice(0, 3), [1, 4, 7]);
  assert.deepEqual(ROULETTE_SPOTS.get('dozen3')?.slice(0, 2), [25, 26]);
});

test('roulette: bets on the number landed on win, the rest are lost (0 loses every outside bet)', () => {
  const bets = { '17': 10, '17-20': 10, red: 10, black: 20, odd: 5, dozen2: 10 };
  const settled = settleBets(bets, { number: 17, color: 'black' });
  assert.deepEqual(
    settled.map((b) => [b.spot, b.outcome, b.returned]),
    [
      ['17', 'win', 360],
      ['17-20', 'win', 180],
      ['red', 'lose', 0],
      ['black', 'win', 40],
      ['odd', 'win', 10],
      ['dozen2', 'win', 30],
    ],
  );
  assert.equal(lostChips(settled), 10);
  const zero = settleBets({ red: 10, black: 10, '0': 1, '00': 1 }, { number: 0, color: 'green' });
  assert.deepEqual(zero.map((b) => [b.spot, b.returned]), [['0', 36], ['red', 0], ['black', 0], ['00', 0]]);
  const double = settleBets({ '00': 1, '0-00': 2, even: 10, '00-2-3': 3 }, { number: '00', color: 'green' });
  assert.deepEqual(double.map((b) => [b.spot, b.returned]), [['00', 36], ['0-00', 36], ['even', 0], ['00-2-3', 36]]);
});

test('roulette: over every pocket, the house keeps 2/38 of any bet (3/38 of the top line)', () => {
  const pockets = ['00' as const, ...Array.from({ length: 37 }, (_, n) => n)];
  const back = (spot: string): number => pockets.reduce((sum, n) => sum + settleBets({ [spot]: 1000 }, { number: n, color: colorOf(n) })[0]!.returned, 0);
  for (const spot of ['17', '00', '0-00', '00-2-3', '0-1', '31-32-34-35', 'red', 'low', 'column2', 'dozen1']) assert.equal(back(spot), 36 * 1000, spot);
  assert.equal(back('0-00-1-2-3'), 35 * 1000);
});

test('roulette: a spin lands in one of the 38 pockets', () => {
  assert.deepEqual(spin(() => 0), { number: 0, color: 'green' });
  assert.deepEqual(spin(() => 36), { number: 36, color: 'red' });
  assert.deepEqual(spin((max) => max - 1), { number: '00', color: 'green' });
  for (let i = 0; i < 300; i++) {
    const { number } = spin();
    assert.ok(number === '00' || (Number.isInteger(number) && number >= 0 && number <= 36));
  }
});

test('roulette: chips from the page are read only on real spots, in whole points', () => {
  assert.deepEqual(parseBets({ '17': 5, red: 0, '0-00-1-2-3': 10 }), { '17': 5, '0-00-1-2-3': 10 });
  assert.equal(parseBets({ '3-4': 5 }), null);
  assert.equal(parseBets({ '0-1-2-3': 5 }), null, 'no first four on a wheel with 00');
  assert.equal(parseBets({ red: 1.5 }), null);
  assert.equal(totalBet({ '17': 5, red: 20 }), 25);
  assert.deepEqual(parseClientMessage('{"t":"bets","seq":1,"bets":{"red":5}}'), { t: 'bets', seq: 1, bets: { red: 5 } });
  assert.equal(parseClientMessage('{"t":"bets","seq":1,"bets":{"banker":5}}'), null);
});

test('roulette: its settings, config page, command and site entry exist', () => {
  assert.deepEqual(DEFAULTS.roulette, { minBet: 1, maxBet: 10_000 });
  assert.ok(findSpec('roulette.minBet'));
  assert.ok(findSpec('roulette.maxBet'));
  assert.ok(GROUPS.includes('Roulette'));
  assert.equal(checkConstraints({ ...DEFAULTS, roulette: { minBet: 50, maxBet: 10 } }), 'roulette.minBet cannot be higher than roulette.maxBet');
  assert.deepEqual(GAMES.roulette, { page: '/games/roulette', socket: '/roulette' });
  assert.match(TEXT.roulette.intro('10,000'), /35 to 1/);
  assert.equal(CONFIG.roulette.maxBet, 10_000);
});

// ---------------------------------------------------------------------------
// The table: the same machinery as baccarat's (web/table/table.ts, tested fully in baccarat-table.test.ts),
// here with roulette's round.

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

test('roulette table: up to 8 play together, the wheel is spun once for all, and the last numbers are kept', async () => {
  resetLive();
  resetTables();
  const balances: Record<string, number> = {};
  const numbers = [17, '00' as const];
  // Every table's timers; `fire` runs the ones due now (each table's betting or showing time up).
  let timers: { run: () => void; off: boolean }[] = [];
  const fire = (): void => {
    const due = timers.filter((t) => !t.off);
    timers = [];
    for (const t of due) t.run();
  };
  const deps: TableDeps = {
    balance: async () => 1000,
    avatar: (_g, userId) => `https://cdn.example/${userId}.png`,
    deal: () => {
      const number = numbers.shift()!;
      return { number, color: colorOf(number) };
    },
    now: () => 0,
    schedule: (_ms, run) => {
      const timer = { run, off: false };
      timers.push(timer);
      return () => void (timer.off = true);
    },
    play: async (_g, userId, bets, deal) => {
      const round = deal();
      const settled = settleBets(bets, round);
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
  const players = [];
  for (let i = 1; i <= ROULETTE_TABLE.seats + 1; i++) players.push(await join(`u${i}`));
  assert.deepEqual(tablesIn('g1').map((t) => t.players), [8, 1]);
  // The ninth leaves, so only table 1 spins (a table spins even with no chips down).
  players.pop()!.connection.closed();
  assert.deepEqual(tablesIn('g1').map((t) => t.players), [8]);
  const [a, b] = players as [Awaited<ReturnType<typeof join>>, Awaited<ReturnType<typeof join>>];
  assert.deepEqual([a.page.last().maxSeats, a.page.last().chips, a.page.last().msLeft], [8, [...TABLE_CHIPS], ROULETTE_TABLE.bettingMs]);

  await a.connection.receive(JSON.stringify({ t: 'bets', seq: 1, bets: { '17': 10, red: 10 } }));
  await b.connection.receive(JSON.stringify({ t: 'bets', seq: 1, bets: { black: 100 } }));
  fire();
  await new Promise((resolve) => setImmediate(resolve));
  const state = a.page.last();
  assert.deepEqual([state.phase, state.round], ['dealing', { no: 1, number: 17, color: 'black', recent: [17] }]);
  assert.deepEqual(state.seats.slice(0, 2).map((s) => s.result?.net), [340, 100]);
  assert.equal(online('g1').find((p) => p.userId === 'u1')?.status, 'Table 1 · 8/8 · 17 Black · +340');

  // The next round remembers the last number.
  fire();
  await b.connection.receive(JSON.stringify({ t: 'bets', seq: 2, bets: { '00': 1 } }));
  fire();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(b.page.last().round, { no: 2, number: '00', color: 'green', recent: ['00', 17] });
  assert.equal(b.page.last().seats[1]?.result?.net, 35);
  for (const p of players) p.connection.closed();
  assert.deepEqual(tablesIn('g1'), []);
});
