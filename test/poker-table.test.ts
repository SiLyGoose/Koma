import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import { POKER_TABLE } from '../src/constants/index.js';
import { RANKS, SUITS, type Card } from '../src/lib/game/casino/blackjack.js';
import type { BuyInResult } from '../src/services/casino/poker.js';
import type { PokerState, ServerMessage } from '../src/web/games/poker/protocol.js';
import { PokerTables, type Peer, type PokerDeps, type PokerTable } from '../src/web/games/poker/table.js';
import type { Player } from '../src/web/auth/token.js';

/*
 * The poker tables (web/games/poker/table.ts): sitting down and standing up, hands dealt on a clock,
 * moves timing out, players whose page went away, bots, and where the chips go. The points and the
 * clock are fakes.
 */

/** A clock the test moves on by hand, running each timer as its time comes. */
function fakeClock() {
  let now = 1_000_000;
  const timers: { at: number; run: () => void; live: boolean }[] = [];
  return {
    now: () => now,
    schedule(ms: number, run: () => void) {
      const timer = { at: now + ms, run, live: true };
      timers.push(timer);
      return () => {
        timer.live = false;
      };
    },
    /** Moves the clock on `ms`, running every timer due by then (and letting the table catch up after each). */
    async tick(ms: number, table: () => PokerTable | undefined) {
      const end = now + ms;
      for (;;) {
        await settle(table());
        const due = timers.filter((t) => t.live && t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        now = due.at;
        due.live = false;
        due.run();
      }
      now = end;
      await settle(table());
    },
  };
}

async function settle(table: PokerTable | undefined): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await table?.settled();
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** A deck in a fixed order (no shuffle), so hands come out the same every run. */
const fixedDeck = (): Card[] => SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit }) as Card));

function setup(balances: Record<string, number> = { a: 10_000, b: 10_000, c: 10_000 }) {
  const clock = fakeClock();
  const seats = new Map<string, { userId: string; chips: number }>();
  const house: number[] = [];
  let next = 0;
  const deps: PokerDeps = {
    async buyIn(_guildId, userId, _tableKey, chips): Promise<BuyInResult> {
      const { minBuyIn, maxBuyIn } = CONFIG.poker;
      if (chips < minBuyIn || chips > maxBuyIn) return { ok: false, reason: 'out_of_range', min: minBuyIn, max: maxBuyIn };
      const balance = balances[userId] ?? 0;
      if (balance < chips) return { ok: false, reason: 'too_poor', balance };
      balances[userId] = balance - chips;
      const seatId = `seat${++next}`;
      seats.set(seatId, { userId, chips });
      return { ok: true, seatId, chips, balance: balances[userId] as number };
    },
    async saveChips(seatId, chips) {
      const seat = seats.get(seatId);
      if (seat) seat.chips = chips;
    },
    async cashOut(seatId) {
      const seat = seats.get(seatId);
      if (!seat) return null;
      seats.delete(seatId);
      balances[seat.userId] = (balances[seat.userId] ?? 0) + seat.chips;
      return { amount: seat.chips, balance: balances[seat.userId] as number };
    },
    renewSeats: async () => {},
    houseTake: async (_guildId, amount) => void house.push(amount),
    balance: async (_guildId, userId) => balances[userId] ?? 0,
    avatar: () => null,
    deck: fixedDeck,
    random: () => 0.5,
    now: clock.now,
    schedule: clock.schedule,
  };
  const tables = new PokerTables(deps);
  let current: PokerTable | undefined;
  const pages = new Map<string, { peer: Peer; sent: ServerMessage[] }>();
  const page = (userId: string) => {
    const sent: ServerMessage[] = [];
    const peer: Peer = { send: (m) => void sent.push(m), close: () => {} };
    pages.set(userId, { peer, sent });
    return { peer, sent };
  };
  const player = (userId: string): Player => ({ guildId: 'g', userId, name: userId.toUpperCase() }) as Player;
  return {
    balances,
    seats,
    house,
    clock,
    tables,
    table: () => current,
    async join(userId: string) {
      const { peer } = page(userId);
      const joined = await tables.join(player(userId), peer);
      current = joined.table;
      return joined;
    },
    /** The last table `userId`'s page was sent. */
    state(userId: string): PokerState {
      const sent = pages.get(userId)?.sent ?? [];
      const last = [...sent].reverse().find((m) => m.t === 'poker');
      return (last as { state: PokerState }).state;
    },
    refusals: (userId: string) => (pages.get(userId)?.sent ?? []).filter((m) => m.t === 'refused'),
    peer: (userId: string) => pages.get(userId)?.peer as Peer,
    tick: (ms: number) => clock.tick(ms, () => current),
  };
}

/** Whose turn it is, by member id. */
const turn = (state: PokerState): string | undefined => state.seats.find((s) => s?.seat === state.hand?.toAct)?.id;

test('two players sit down, and a hand is dealt after a pause; each page only sees its own cards', async () => {
  const t = setup();
  await t.join('a');
  await t.join('b');
  assert.equal(t.state('a').phase, 'waiting');
  assert.equal(await t.table()?.sit('a', 1000), null);
  assert.equal(t.balances.a, 9000);
  assert.equal(t.state('a').phase, 'waiting', 'one player is not a game');
  assert.equal(await t.table()?.sit('b', 2000, 5), null);
  assert.equal(t.state('a').phase, 'next');
  await t.tick(POKER_TABLE.nextHandMs);
  const a = t.state('a');
  assert.equal(a.phase, 'playing');
  const mine = a.seats.find((s) => s?.id === 'a');
  const theirs = a.seats.find((s) => s?.id === 'b');
  assert.equal(mine?.cards?.length, 2);
  assert.equal(theirs?.cards, null, "never the other player's cards");
  assert.equal(theirs?.seat, 5);
  assert.equal(a.hand?.pot, CONFIG.poker.smallBlind + CONFIG.poker.bigBlind);
});

test('a move out of turn is refused; a player who runs out of time checks or folds', async () => {
  const t = setup();
  await t.join('a');
  await t.join('b');
  await t.table()?.sit('a', 1000);
  await t.table()?.sit('b', 1000);
  await t.tick(POKER_TABLE.nextHandMs);
  const first = turn(t.state('a')) as string;
  const other = first === 'a' ? 'b' : 'a';
  assert.deepEqual(await t.table()?.act(other, 'call'), { reason: 'not_now' });
  // The first to act preflop (heads up, the small blind) faces the big blind: out of time, they fold.
  await t.tick(CONFIG.poker.turnSeconds * 1000);
  const after = t.state('a');
  assert.ok(after.hand?.result, 'the hand is over');
  assert.equal(after.seats.find((s) => s?.id === first)?.folded, true);
  // The chips are saved once the hand is over.
  assert.deepEqual(
    [...t.seats.values()].map((s) => s.chips).sort((x, y) => x - y),
    [1000 - CONFIG.poker.smallBlind, 1000 + CONFIG.poker.smallBlind],
  );
});

test('a whole hand checked down: the rake goes to the house, and the next hand follows', async () => {
  const t = setup();
  await t.join('a');
  await t.join('b');
  await t.table()?.sit('a', 1000);
  await t.table()?.sit('b', 1000);
  await t.tick(POKER_TABLE.nextHandMs);
  for (let i = 0; i < 20; i++) {
    const s = t.state('a');
    if (s.hand?.result) break;
    const who = turn(s);
    if (!who) {
      await t.tick(POKER_TABLE.allInStreetMs);
      continue;
    }
    const move = t.state(who).move;
    assert.equal(await t.table()?.act(who, move?.check ? 'check' : 'call'), null);
  }
  const done = t.state('a').hand;
  assert.ok(done?.result);
  assert.equal(done.board.length, 5);
  const pot = 2 * CONFIG.poker.bigBlind;
  assert.deepEqual(t.house, [Math.min(CONFIG.poker.rakeCap, Math.floor(pot * CONFIG.poker.rake))]);
  // Both hands were shown down.
  assert.equal(Object.keys(done.result.shown).length, 2);
  assert.ok(t.state('b').seats.every((s) => !s || s.cards?.length === 2), 'face up at the showdown');
  await t.tick(POKER_TABLE.nextHandMs);
  assert.equal(t.state('a').hand?.no, 2);
});

test('standing up between hands pays the chips straight back; in a hand, it folds and pays after', async () => {
  const t = setup();
  await t.join('a');
  await t.join('b');
  await t.join('c');
  await t.table()?.sit('a', 1000);
  await t.table()?.sit('b', 1000);
  await t.table()?.sit('c', 1000);
  await t.tick(POKER_TABLE.nextHandMs);
  // c is in the hand; c gets up out of turn.
  await t.table()?.stand('c');
  const s = t.state('a');
  assert.equal(s.seats.find((x) => x?.id === 'c')?.folded, true);
  assert.equal(s.seats.find((x) => x?.id === 'c')?.leaving, true);
  assert.notEqual(t.balances.c, 10_000, 'not paid yet: the hand is still on');
  // Everyone else folds to finish it.
  for (let i = 0; i < 5 && !t.state('a').hand?.result; i++) await t.table()?.act(turn(t.state('a')) as string, 'fold');
  assert.ok(t.state('a').hand?.result);
  await t.tick(1);
  // The button starts at seat 0 (a), so c (seat 2) was the big blind: that's all they lost.
  assert.equal(t.balances.c, 10_000 - CONFIG.poker.bigBlind);
  assert.equal(t.state('a').seats.some((x) => x?.id === 'c'), false);
});

test('a player whose page goes away sits out: folded on their turn, and cashed out after a while', async () => {
  const t = setup();
  await t.join('a');
  await t.join('b');
  await t.table()?.sit('a', 1000);
  await t.table()?.sit('b', 1000);
  await t.tick(POKER_TABLE.nextHandMs);
  const first = turn(t.state('a')) as string;
  await t.table()?.leave(first, t.peer(first));
  // Played for them at once: the hand ends without waiting for the clock.
  const watcher = first === 'a' ? 'b' : 'a';
  assert.ok(t.state(watcher).hand?.result);
  assert.equal(t.state(watcher).seats.find((s) => s?.id === first)?.away, true);
  // Away, they aren't dealt in: no next hand with only one player.
  await t.tick(POKER_TABLE.nextHandMs);
  assert.equal(t.state(watcher).hand?.no, 1);
  await t.tick(POKER_TABLE.awayMs);
  assert.equal(t.state(watcher).seats.some((s) => s?.id === first), false);
  assert.equal(t.balances[first], 10_000 - CONFIG.poker.smallBlind);
});

test('bots: a seated player adds one, it plays, and when it leaves its winnings go to the house', async () => {
  const t = setup();
  await t.join('a');
  assert.deepEqual(await t.table()?.addBot('a'), { reason: 'not_now' }, 'only someone seated');
  await t.table()?.sit('a', 1000);
  assert.ok(t.state('a').canAddBot);
  assert.equal(await t.table()?.addBot('a'), null);
  const bot = t.state('a').seats.find((s) => s?.bot);
  assert.equal(bot?.name, 'Chip');
  assert.equal(bot?.chips, CONFIG.poker.maxBuyIn);
  await t.tick(POKER_TABLE.nextHandMs);
  assert.equal(t.state('a').phase, 'playing');
  // Play a few hands: a always folds, the bot plays on its own.
  for (let i = 0; i < 60 && (t.state('a').hand?.no ?? 0) < 3; i++) {
    const s = t.state('a');
    if (turn(s) === 'a') await t.table()?.act('a', s.move?.check ? 'check' : 'fold');
    else await t.tick(POKER_TABLE.botThinkMs[1]);
    if (t.state('a').hand?.result) await t.tick(POKER_TABLE.nextHandMs);
  }
  assert.ok((t.state('a').hand?.no ?? 0) >= 3, 'hands went on with the bot');
  // a folded every hand they had to act in: the bot is up, and that goes to the house when it leaves.
  await t.tick(POKER_TABLE.nextHandMs);
  for (let i = 0; i < 40 && t.state('a').phase === 'playing'; i++) {
    const s = t.state('a');
    if (turn(s) === 'a') await t.table()?.act('a', s.move?.check ? 'check' : 'fold');
    else await t.tick(POKER_TABLE.botThinkMs[1]);
  }
  const botSeat = t.state('a').seats.find((s) => s?.bot) as NonNullable<PokerState['seats'][number]>;
  const up = botSeat.chips - CONFIG.poker.maxBuyIn;
  assert.equal(await t.table()?.removeBot('a', botSeat.seat), null);
  await t.tick(1);
  assert.equal(t.state('a').seats.some((s) => s?.bot), false);
  if (up > 0) assert.ok(t.house.includes(up), `the bot's ${up} went to the house`);
  // Alone again: no hands.
  await t.tick(POKER_TABLE.nextHandMs * 2);
  assert.equal(t.state('a').phase, 'waiting');
});

test('refusals: a taken seat, out of the buy-in range, too poor, sitting twice', async () => {
  const t = setup({ a: 10_000, b: 500 });
  await t.join('a');
  await t.join('b');
  assert.equal(await t.table()?.sit('a', 1000, 2), null);
  assert.deepEqual(await t.table()?.sit('b', 450, 2), { reason: 'seat_taken' });
  assert.deepEqual(await t.table()?.sit('b', 1, 3), { reason: 'buy_in', min: CONFIG.poker.minBuyIn, max: CONFIG.poker.maxBuyIn });
  assert.deepEqual(await t.table()?.sit('b', 600, 3), { reason: 'too_poor', balance: 500 });
  assert.deepEqual(await t.table()?.sit('a', 1000), { reason: 'not_now' });
});

test('the table closes once nobody is at it, and the next page opens a new one', async () => {
  const t = setup();
  await t.join('a');
  await t.table()?.sit('a', 1000);
  await t.table()?.addBot('a');
  const first = t.table();
  await t.table()?.stand('a');
  await t.table()?.leave('a', t.peer('a'));
  assert.equal(t.tables.in('g').length, 0);
  assert.equal(t.balances.a, 10_000);
  await t.join('b');
  assert.notEqual(t.table(), first);
  assert.equal(t.table()?.number, 1);
});

test('a full table: the next page joins a new one', async () => {
  const balances: Record<string, number> = {};
  for (let i = 0; i < 10; i++) balances[`p${i}`] = 10_000;
  const t = setup(balances);
  for (let i = 0; i < POKER_TABLE.seats; i++) {
    await t.join(`p${i}`);
    await t.table()?.sit(`p${i}`, 1000);
  }
  await t.join('p9');
  assert.equal(t.table()?.number, 2);
});
