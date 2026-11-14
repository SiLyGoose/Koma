import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Card, Suit } from '../src/lib/game/casino/blackjack.js';
import { botAction, chenScore, draws, estimateEquity, PokerReads, texture } from '../src/lib/game/casino/poker/bot.js';
import { act, advance, buildPots, forfeit, legalActions, startHand, type HandOptions, type HandState, type PokerAction } from '../src/lib/game/casino/poker/hand.js';
import { bestHand, compareRanks, handName, rankFive } from '../src/lib/game/casino/poker/rank.js';
import { parseClientMessage } from '../src/web/games/poker/protocol.js';

/*
 * Texas hold'em's rules (lib/game/casino/poker/): ranking hands, a hand's betting, pots and
 * showdown, and the bots.
 */

const SUIT: Record<string, Suit> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const RANK: Record<string, number> = { A: 1, K: 13, Q: 12, J: 11, T: 10 };
/** A card from text like "As", "Td", "7c". */
const c = (text: string): Card => ({ rank: RANK[text[0] as string] ?? Number(text[0]), suit: SUIT[text[1] as string] as Suit });
const cards = (text: string): Card[] => text.split(' ').map(c);

const OPTIONS: HandOptions = { small: 10, big: 20, rake: { rate: 0.05, cap: 100 } };
const NO_RAKE: HandOptions = { ...OPTIONS, rake: { rate: 0, cap: 0 } };

/**
 * A deck that deals `holes` (each player's two cards, in the order of `players`) and then `board`
 * (five cards), with the button at `button`. Cards are dealt one at a time left of the button, and
 * a card is burned before each street.
 */
function stacked(holes: string[], board: string, button: number): Card[] {
  const n = holes.length;
  const out: Card[] = [];
  for (let round = 0; round < 2; round++) for (let i = 1; i <= n; i++) out.push(cards(holes[(button + i) % n] as string)[round] as Card);
  const b = cards(board);
  const burn = c('2c');
  out.push(burn, b[0] as Card, b[1] as Card, b[2] as Card, burn, b[3] as Card, burn, b[4] as Card);
  return out;
}

const players = (...stacks: number[]) => stacks.map((stack, i) => ({ id: `p${i}`, seat: i, stack }));
const stackOf = (state: HandState, id: string): number => state.players.find((p) => p.id === id)?.stack as number;

/** Plays the hand out with checks and calls (advancing through the streets) until it's over. */
function checkDown(state: HandState): void {
  for (let i = 0; i < 100 && !state.done; i++) {
    if (state.toAct === null) {
      advance(state);
      continue;
    }
    const legal = legalActions(state);
    const id = state.players[state.toAct]?.id as string;
    act(state, id, legal?.check ? { type: 'check' } : { type: 'call' });
  }
}

// ---------------------------------------------------------------------------
// Ranking hands
// ---------------------------------------------------------------------------

test('rankFive: every category, weakest to strongest', () => {
  const hands = [
    'As Kd 9c 7h 3s',
    'As Ad 9c 7h 3s',
    'As Ad 9c 9h 3s',
    'As Ad Ac 7h 3s',
    '5s 4d 3c 2h As',
    'Ks Js 9s 7s 3s',
    'As Ad Ac 7h 7s',
    'As Ad Ac Ah 3s',
    '9h 8h 7h 6h 5h',
  ].map((h) => rankFive(cards(h)));
  hands.forEach((h, i) => assert.equal(h.category, i, `category ${i}`));
  for (let i = 1; i < hands.length; i++) assert.ok(compareRanks(hands[i] as never, hands[i - 1] as never) > 0, `${i} beats ${i - 1}`);
});

test('rankFive: A-2-3-4-5 is the lowest straight, and kickers break ties', () => {
  assert.deepEqual(rankFive(cards('As 2d 3c 4h 5s')), { category: 4, values: [5] });
  assert.ok(compareRanks(rankFive(cards('6s 2d 3c 4h 5s')), rankFive(cards('As 2d 3c 4h 5s'))) > 0);
  assert.ok(compareRanks(rankFive(cards('Ts Td 9c 7h 4s')), rankFive(cards('Th Tc 9d 7s 3s'))) > 0, 'same pair, better last kicker');
  assert.equal(compareRanks(rankFive(cards('Ts Td 9c 7h 4s')), rankFive(cards('Th Tc 9d 7s 4h'))), 0, 'the same hand in other suits');
  // Two pair: the top pair first, then the second, then the kicker.
  assert.ok(compareRanks(rankFive(cards('Ks Kd 2c 2h As')), rankFive(cards('Qs Qd Jc Jh As'))) > 0);
});

test('bestHand: the best five of seven, and its name', () => {
  const best = bestHand(cards('Ah Kh Qh Jh 2c Th 9s'));
  assert.equal(handName(best.rank), 'Royal flush');
  assert.equal(best.cards.length, 5);
  assert.equal(handName(bestHand(cards('Ks Kd 7c 7h 7s 2d 3c')).rank), 'Full house, Sevens over Kings');
  assert.equal(handName(bestHand(cards('Ks Kd Qc Qh 7s 7d 3c')).rank), 'Two pair, Kings and Queens');
  assert.equal(handName(bestHand(cards('As 9d 7c 5h 3s 2d Jc')).rank), 'Ace high');
  assert.equal(handName(bestHand(cards('9s 8d 7c 6h 5s 2d 2c')).rank), 'Straight, Nine high');
});

// ---------------------------------------------------------------------------
// A hand
// ---------------------------------------------------------------------------

test('heads up: the button posts the small blind and acts first before the flop, last after it', () => {
  const state = startHand(players(1000, 1000), 0, OPTIONS, stacked(['As Ad', 'Ks Kd'], '2h 7c 9d Jc 3s', 0));
  assert.deepEqual(state.players.map((p) => p.bet), [10, 20]);
  assert.equal(state.toAct, 0, 'the button (small blind) first preflop');
  assert.deepEqual(state.players[0]?.hole, cards('As Ad'));
  act(state, 'p0', { type: 'call' });
  // The big blind still has their option.
  assert.equal(state.toAct, 1);
  assert.deepEqual(legalActions(state), { check: true, call: 0, raise: { min: 40, max: 1000 } });
  act(state, 'p1', { type: 'check' });
  assert.equal(state.toAct, null);
  advance(state);
  assert.equal(state.street, 'flop');
  assert.deepEqual(state.board, cards('2h 7c 9d'));
  assert.equal(state.toAct, 1, 'the big blind first after the flop');
});

test('three players: blinds left of the button, and the first to act is left of the big blind', () => {
  const state = startHand(players(1000, 1000, 1000), 0, OPTIONS, stacked(['As Ad', 'Ks Kd', 'Qs Qd'], '2h 7c 9d Jc 3s', 0));
  assert.deepEqual(state.players.map((p) => p.bet), [0, 10, 20]);
  assert.equal(state.toAct, 0);
});

test('everyone folds to a raise: the raiser takes the blinds, gets the uncalled raise back, and there is no rake before a flop', () => {
  const state = startHand(players(1000, 1000, 1000), 0, OPTIONS, stacked(['As Ad', 'Ks Kd', 'Qs Qd'], '2h 7c 9d Jc 3s', 0));
  act(state, 'p0', { type: 'raise', to: 60 });
  act(state, 'p1', { type: 'fold' });
  act(state, 'p2', { type: 'fold' });
  assert.ok(state.done);
  assert.equal(state.result?.rake, 0);
  assert.deepEqual(state.result?.returned, { id: 'p0', amount: 40 });
  assert.deepEqual(state.result?.pots, [{ amount: 50, winners: ['p0'], hand: null }]);
  assert.deepEqual(state.players.map((p) => p.stack), [1030, 990, 980]);
});

test('a raise must be at least the last one, and a short all-in does not reopen the betting', () => {
  const state = startHand([...players(1000, 1000), { id: 'p2', seat: 2, stack: 90 }], 0, NO_RAKE, stacked(['As Ad', 'Ks Kd', 'Qs Qd'], '2h 7c 9d Jc 3s', 0));
  // Raise to 60 (a raise of 40): the next raise must add at least 40 more.
  act(state, 'p0', { type: 'raise', to: 60 });
  assert.deepEqual(legalActions(state)?.raise, { min: 100, max: 1000 });
  assert.equal(act(state, 'p1', { type: 'raise', to: 80 }), 'bad_amount');
  act(state, 'p1', { type: 'call' });
  // The big blind goes all in for 90: only 30 more, short of a full raise.
  act(state, 'p2', { type: 'raise', to: 90 });
  assert.ok(state.players[2]?.allIn);
  // p0 and p1 already acted: they may call or fold, but not raise again.
  assert.equal(state.toAct, 0);
  assert.equal(legalActions(state)?.raise, null);
  assert.equal(legalActions(state)?.call, 30);
});

test('side pots: each all-in player can only win what they matched', () => {
  // p0 has the best hand but only 100; p1 beats p2 for the side pot.
  const state = startHand(players(100, 500, 500), 2, NO_RAKE, stacked(['As Ad', 'Ks Kd', 'Qs Qd'], '2h 7c 9d Jc 3s', 2));
  // Button p2; p0 small blind, p1 big blind; p2 first.
  act(state, 'p2', { type: 'raise', to: 500 });
  act(state, 'p0', { type: 'call' });
  act(state, 'p1', { type: 'call' });
  assert.ok(state.cardsUp, 'nobody can bet any more: the cards go face up');
  checkDown(state);
  assert.deepEqual(
    state.result?.pots.map((p) => [p.amount, p.winners]),
    [
      [300, ['p0']],
      [800, ['p1']],
    ],
  );
  assert.equal(state.result?.pots[0]?.hand, 'Pair of Aces');
  assert.deepEqual(state.players.map((p) => p.stack), [300, 800, 0]);
  assert.deepEqual(Object.keys(state.result?.shown ?? {}).sort(), ['p0', 'p1', 'p2']);
});

test('buildPots: folded chips stay in the pot, and pots with the same players are one', () => {
  const pot = (id: string, committed: number, folded = false) => ({ id, committed, folded }) as never;
  assert.deepEqual(buildPots([pot('a', 50, true), pot('b', 200), pot('c', 200)]), [{ amount: 450, eligible: ['b', 'c'] }]);
  assert.deepEqual(buildPots([pot('a', 100), pot('b', 300), pot('c', 300)]), [
    { amount: 300, eligible: ['a', 'b', 'c'] },
    { amount: 400, eligible: ['b', 'c'] },
  ]);
});

test('a split pot: shared evenly, the odd chip to the first winner left of the button', () => {
  // The board plays: both have the straight on it.
  const state = startHand(players(1000, 1000, 1000), 0, NO_RAKE, stacked(['2s 3d', '2h 3c', 'Ks 4d'], '9s Th Jc Qd 8h', 0));
  act(state, 'p0', { type: 'call' });
  act(state, 'p1', { type: 'call' });
  act(state, 'p2', { type: 'check' });
  advance(state);
  act(state, 'p1', { type: 'raise', to: 25 });
  act(state, 'p2', { type: 'fold' });
  act(state, 'p0', { type: 'call' });
  checkDown(state);
  assert.deepEqual(state.result?.pots, [{ amount: 110, winners: ['p0', 'p1'], hand: 'Straight, Queen high' }]);
  assert.deepEqual(state.result?.won, { p0: 55, p1: 55 });

  // Blinds of 5/10, the small blind folds: 25 between the two left, so one of them gets 13.
  const odd = startHand(players(1000, 1000, 1000), 0, { ...NO_RAKE, small: 5, big: 10 }, stacked(['2s 3d', 'Ks Kd', '2h 3c'], '9s Th Jc Qd 8h', 0));
  act(odd, 'p0', { type: 'call' });
  act(odd, 'p1', { type: 'fold' });
  checkDown(odd);
  // Left of the button (p0) come p1 (folded), then p2: p2 gets the odd chip.
  assert.deepEqual(odd.result?.won, { p0: 12, p2: 13 });
});

test('the rake: a share of a pot that saw a flop, at most the cap', () => {
  const small = startHand(players(1000, 1000), 0, OPTIONS, stacked(['As Ad', 'Ks Kd'], '2h 7c 9d Jc 3s', 0));
  checkDown(small);
  // 40 in the pot: 5% is 2.
  assert.equal(small.result?.rake, 2);
  assert.deepEqual(small.players.map((p) => p.stack), [1018, 980]);

  const big = startHand(players(5000, 5000), 0, OPTIONS, stacked(['As Ad', 'Ks Kd'], '2h 7c 9d Jc 3s', 0));
  act(big, 'p0', { type: 'raise', to: 5000 });
  act(big, 'p1', { type: 'call' });
  checkDown(big);
  assert.equal(big.result?.rake, 100);
  assert.equal(big.players[0]?.stack, 10_000 - 100);
});

test('forfeit: a player who gets up folds, on their turn or not', () => {
  const state = startHand(players(1000, 1000, 1000), 0, NO_RAKE, stacked(['As Ad', 'Ks Kd', 'Qs Qd'], '2h 7c 9d Jc 3s', 0));
  // Not their turn (p0's is).
  forfeit(state, 'p2');
  assert.ok(state.players[2]?.folded);
  assert.equal(state.toAct, 0);
  act(state, 'p0', { type: 'fold' });
  // Only the small blind left of the three: they win.
  assert.ok(state.done);
  assert.deepEqual(state.result?.won, { p1: 30 });
});

// ---------------------------------------------------------------------------
// The bots
// ---------------------------------------------------------------------------

/** A steady stream of numbers from 0 up to 1, the same every run. */
function seeded(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

test('estimateEquity: aces are a big favourite, a made hand on the river is certain', () => {
  assert.ok(estimateEquity(cards('As Ad'), [], 1, seeded()) > 0.75);
  assert.ok(estimateEquity(cards('7s 2d'), [], 1, seeded()) < 0.45);
  assert.equal(estimateEquity(cards('Ah Kh'), cards('Qh Jh Th 2c 3d'), 3, seeded(), 50), 1);
});

test('chenScore: the best and the worst starting hands', () => {
  assert.equal(chenScore(c('As'), c('Ad')), 20);
  assert.equal(chenScore(c('Ks'), c('As')), 12);
  assert.equal(chenScore(c('7s'), c('2d')), -1);
  assert.equal(chenScore(c('2s'), c('2d')), 5);
});

test("estimateEquity: a hand that beats a random one is well behind a raiser's", () => {
  assert.ok(estimateEquity(cards('Ah 9d'), [], [1], seeded()) > 0.55);
  assert.ok(estimateEquity(cards('Ah 9d'), [], [0.05], seeded()) < 0.35);
});

test('botAction: a hand that beats a random one folds to a player who raised and raised again', () => {
  const state = startHand(players(2000, 2000), 0, NO_RAKE, stacked(['Ks Kd', 'Ah 9d'], '3c 4d 8h Js Qc', 0));
  // Heads up the button (p0) acts first: all in, as if after raising twice already.
  assert.equal(act(state, 'p0', { type: 'raise', to: 2000 }), null);
  (state.players[0] as HandState['players'][number]).raises = 3;
  assert.deepEqual(botAction(state, seeded(3)), { type: 'fold' });
  // Raised only the once, the same all in is called (A9 is ahead of any two cards).
  (state.players[0] as HandState['players'][number]).raises = 0;
  assert.deepEqual(botAction(state, seeded(3)), { type: 'call' });
});

test('botAction: always a move the bot may make, and it never folds what it can check', () => {
  const random = seeded(7);
  for (let deal = 0; deal < 30; deal++) {
    const state = startHand(players(1000, 1000, 1000, 1000), deal % 4, OPTIONS);
    for (let i = 0; i < 200 && !state.done; i++) {
      if (state.toAct === null) {
        advance(state);
        continue;
      }
      const legal = legalActions(state);
      const move = botAction(state, random);
      if (legal?.check) assert.notEqual(move.type, 'fold');
      const id = state.players[state.toAct]?.id as string;
      assert.equal(act(state, id, move), null, JSON.stringify(move));
    }
    assert.ok(state.done);
    // Chips never appear or vanish: everything is in the stacks or the rake.
    const total = state.players.reduce((sum, p) => sum + p.stack, 0) + (state.result?.rake ?? 0);
    assert.equal(total, 4000);
  }
});

/** A heads-up hand on the flop: p0 (the button) raised before it, p1 called, and p1 has checked to p0. */
function checkedToRaiser(holes: [string, string], board: string): HandState {
  const state = startHand(players(2000, 2000), 0, NO_RAKE, stacked(holes, board, 0));
  act(state, 'p0', { type: 'raise', to: 60 });
  act(state, 'p1', { type: 'call' });
  advance(state);
  act(state, 'p1', { type: 'check' });
  return state;
}

/** What a bot does in `state` over many tries, by move. */
function moves(state: HandState, tries = 100): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < tries; i++) {
    const move = botAction(state, seeded(i + 1));
    out[move.type] = (out[move.type] ?? 0) + 1;
  }
  return out;
}

test('texture and draws: a wet board, a flush draw, an open-ended straight draw and a gutshot', () => {
  assert.ok(texture(cards('9h Th 2h')).wet >= 0.5);
  assert.ok(texture(cards('Ks 7d 2c')).wet < 0.3);
  assert.deepEqual(draws(cards('Ah 5h'), cards('Kh 9h 2c')), { flush: true, straight: 0 });
  assert.deepEqual(draws(cards('8c 9d'), cards('Ts Jh 2c')), { flush: false, straight: 2 });
  assert.deepEqual(draws(cards('8c 9d'), cards('Js Qh 2c')), { flush: false, straight: 1 });
  // No draws left to make on the river.
  assert.deepEqual(draws(cards('Ah 5h'), cards('Kh 9h 2c 3d 7s')), { flush: false, straight: 0 });
});

test('estimateEquity: bottom pair is ahead of any two cards, but behind a player who bet the flop twice', () => {
  const hole = cards('3h 5d');
  const board = cards('3c Kh 9s');
  assert.ok(estimateEquity(hole, board, [1], seeded()) > 0.55);
  assert.ok(estimateEquity(hole, board, [{ start: 1, board: 2, bluffs: 0 }], seeded()) < 0.3);
});

test('botAction: the preflop raiser, checked to on the flop with nothing, bets some of the time but not always', () => {
  const made = moves(checkedToRaiser(['7c 2d', 'Qs Qd'], 'Ks 9h 4c 3d 8s'));
  assert.ok((made.raise ?? 0) > 20 && (made.raise ?? 0) < 95, JSON.stringify(made));
  assert.equal(made.fold, undefined);
});

test('botAction: its bets are the same sizes with nothing as with a strong hand', () => {
  const sizes = (state: HandState) => {
    const out = new Set<number>();
    for (let i = 0; i < 120; i++) {
      const move: PokerAction = botAction(state, seeded(i + 1));
      if (move.type === 'raise') out.add(move.to);
    }
    return out;
  };
  const bluffs = sizes(checkedToRaiser(['7c 2d', 'Qs Qd'], 'Ks 9h 4c 3d 8s'));
  const value = sizes(checkedToRaiser(['Kc Kd', 'Qs Qd'], 'Ks 9h 4c 3d 8s'));
  assert.ok(bluffs.size >= 3);
  assert.deepEqual([...bluffs].sort(), [...value].sort());
});

test('botAction: a very strong hand sometimes checks to trap, on a dry flop', () => {
  const made = moves(checkedToRaiser(['Kc Kd', 'Qs Qd'], 'Ks 9h 4c 3d 8s'));
  assert.ok((made.check ?? 0) > 10 && (made.raise ?? 0) > 50, JSON.stringify(made));
});

test('botAction: a short stack goes all in or folds before the flop', () => {
  const state = startHand(players(150, 2000), 0, NO_RAKE, stacked(['As Kd', '7c 2d'], '3c 4d 8h Js Qc', 0));
  assert.deepEqual(botAction(state, seeded(2)), { type: 'raise', to: 150 });
  const junk = startHand(players(150, 2000), 0, NO_RAKE, stacked(['7c 2d', 'As Kd'], '3c 4d 8h Js Qc', 0));
  assert.deepEqual(botAction(junk, seeded(2)), { type: 'fold' });
});

test('PokerReads: a player caught bluffing is given a wider range, one who never folds is taken not to', () => {
  const reads = new PokerReads();
  const bluffer = (): HandState => {
    // p0 bets every street with nothing and is called down by p1.
    const state = startHand(players(2000, 2000), 0, NO_RAKE, stacked(['7c 2d', 'Qs Qd'], 'Ks 9h 4c 3d 8s', 0));
    reads.dealt(state);
    const move = (id: string, action: PokerAction) => {
      reads.saw(state, id, action);
      act(state, id, action);
    };
    move('p0', { type: 'raise', to: 60 });
    move('p1', { type: 'call' });
    for (let street = 0; street < 3; street++) {
      advance(state);
      move('p1', { type: 'check' });
      move('p0', { type: 'raise', to: 100 });
      move('p1', { type: 'call' });
    }
    advance(state);
    reads.handOver(state);
    return state;
  };
  const p0 = bluffer().players[0] as HandState['players'][number];
  // A player the table hasn't seen yet is read by the betting alone.
  const first = reads.range({ ...p0, id: 'stranger', raises: 1, postflopRaises: 0 });
  for (let i = 0; i < 10; i++) bluffer();
  const after = reads.range({ ...p0, raises: 1, postflopRaises: 0 });
  assert.ok(after.start > first.start * 1.5 && after.bluffs > 0.5, JSON.stringify({ first, after }));
  // p1 never folded to p0's bets: a calling station isn't bluffed.
  assert.ok(reads.foldRate('p1') < 0.15);
  assert.equal(reads.foldRate('nobody'), 0.45);
});

// ---------------------------------------------------------------------------
// The page's messages
// ---------------------------------------------------------------------------

test('poker messages: what the page may say, and nothing else (watching included)', () => {
  assert.deepEqual(parseClientMessage('{"t":"hello","token":"x"}'), { t: 'hello', token: 'x' });
  assert.deepEqual(parseClientMessage('{"t":"sit","chips":500}'), { t: 'sit', chips: 500 });
  assert.deepEqual(parseClientMessage('{"t":"sit","chips":500,"seat":3}'), { t: 'sit', chips: 500, seat: 3 });
  assert.deepEqual(parseClientMessage('{"t":"act","move":"raise","amount":120}'), { t: 'act', move: 'raise', amount: 120 });
  assert.deepEqual(parseClientMessage('{"t":"act","move":"allIn"}'), { t: 'act', move: 'allIn' });
  assert.deepEqual(parseClientMessage('{"t":"bot","add":false,"seat":2}'), { t: 'bot', add: false, seat: 2 });
  assert.equal(parseClientMessage('{"t":"watch","token":"x"}'), null);
  assert.equal(parseClientMessage('{"t":"sit","chips":-5}'), null);
  assert.equal(parseClientMessage('{"t":"act","move":"shove"}'), null);
  assert.equal(parseClientMessage('{"t":"act","move":"raise","amount":1.5}'), null);
});
