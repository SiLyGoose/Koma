import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CODE_LENGTH, CODEDLE_WEB } from '../src/constants/index.js';
import { codedleClosed, codedleIn, codedleOpened, lastCodedle, onCodedleChange, type CodeGuess, type CodedleGame } from '../src/events/games/codedle-games.js';
import { scoreGuess } from '../src/lib/events/code.js';
import { GAMES } from '../src/web/config.js';
import { codedleState } from '../src/web/games/codedle/server.js';
import { parseClientMessage } from '../src/web/games/codedle/protocol.js';

const guess = (userId: string, name: string, code: string, g: string): CodeGuess => ({ userId, name, guess: g, marks: scoreGuess(code, g) });

const game = (guesses: CodeGuess[]): CodedleGame => ({
  prize: 5000,
  guessCost: 10,
  opensAt: 1_699_999_700_000,
  endsAt: 1_700_000_000_000,
  guesses,
  guess: async () => ({ ok: false, reason: 'over' }),
});

test('codedle page: a game on the site, with its own socket', () => {
  assert.deepEqual(GAMES.codedle, { page: '/games/codedle', socket: CODEDLE_WEB.path });
});

test("codedle page: while it's going, only the player's own guesses, and how many everyone made", () => {
  const guesses = [guess('1', 'Ann', '04471', '12345'), guess('2', 'Bo', '04471', '04400'), guess('1', 'Ann', '04471', '04411')];
  const state = codedleState('1', game(guesses), null);
  assert.equal(state.length, CODE_LENGTH);
  assert.equal(state.live?.prize, 5000);
  assert.equal(state.live?.guesses, 3);
  assert.equal(state.live?.guessers, 2);
  assert.deepEqual(
    state.live?.mine.map((row) => row.guess),
    ['12345', '04411'],
  );
  assert.ok(state.live?.mine.every((row) => row.mine && row.name === undefined), 'their own, unnamed');
  assert.doesNotMatch(JSON.stringify(state), /04400|Bo|04471/, "nobody else's guesses, and never the code");
  assert.equal(state.last, null);
});

test('codedle page: once it is over, the code, the winner and everyone\'s guesses with their names', () => {
  const guesses = [guess('1', 'Ann', '04471', '12345'), guess('2', 'Bo', '04471', '04471')];
  const state = codedleState('2', null, { code: '04471', prize: 5000, winner: { userId: '2', name: 'Bo' }, guesses, endedAt: 1 });
  assert.equal(state.live, null);
  assert.equal(state.last?.code, '04471');
  assert.equal(state.last?.winner, 'Bo');
  assert.equal(state.last?.won, true);
  assert.deepEqual(
    state.last?.board.map((row) => [row.name, row.guess, row.mine === true]),
    [
      ['Ann', '12345', false],
      ['Bo', '04471', true],
    ],
  );
  assert.equal(codedleState('1', null, { code: '1', prize: 1, winner: null, guesses: [], endedAt: 1 }).last?.won, false);
});

test('codedle page: a revealed board shows only the latest guesses, with the count of all', () => {
  const many = Array.from({ length: CODEDLE_WEB.boardMax + 5 }, (_, i) => guess('1', 'Ann', '99999', String(i).padStart(5, '0')));
  const last = codedleState('1', null, { code: '99999', prize: 1, winner: null, guesses: many, endedAt: 1 }).last;
  assert.equal(last?.board.length, CODEDLE_WEB.boardMax);
  assert.equal(last?.board[0]?.guess, '00005');
  assert.equal(last?.guesses, CODEDLE_WEB.boardMax + 5);
});

test('codedle games: one per server, the last kept once it ends, and listeners told each time', () => {
  const told: string[] = [];
  const stop = onCodedleChange((guildId) => told.push(guildId));
  const one = game([]);
  codedleOpened('g1', one);
  assert.equal(codedleIn('g1'), one);
  assert.equal(codedleIn('g2'), null);
  codedleClosed('g1', { code: '12345', prize: 1, winner: null, guesses: [], endedAt: 1 });
  assert.equal(codedleIn('g1'), null);
  assert.equal(lastCodedle('g1')?.code, '12345');
  // A game that failed is just gone: the last one that ended is kept.
  codedleOpened('g1', game([]));
  codedleClosed('g1', null);
  assert.equal(lastCodedle('g1')?.code, '12345');
  stop();
  codedleOpened('g1', one);
  codedleClosed('g1', null);
  assert.deepEqual(told, ['g1', 'g1', 'g1', 'g1']);
});

test('codedle page: its messages read, anything else refused', () => {
  assert.deepEqual(parseClientMessage(JSON.stringify({ t: 'hello', token: 'abc' })), { t: 'hello', token: 'abc' });
  assert.deepEqual(parseClientMessage(JSON.stringify({ t: 'guess', guess: '04471', seq: 1 })), { t: 'guess', guess: '04471', seq: 1 });
  // (A guess of the wrong digits is the game's to answer: only its shape is checked here.)
  assert.deepEqual(parseClientMessage(JSON.stringify({ t: 'guess', guess: 'abc', seq: 2 })), { t: 'guess', guess: 'abc', seq: 2 });
  for (const bad of [{ t: 'guess', guess: '04471' }, { t: 'guess', guess: '04471', seq: 0 }, { t: 'guess', guess: 'x'.repeat(40), seq: 1 }, { t: 'pick' }, 'nope']) {
    assert.equal(parseClientMessage(JSON.stringify(bad)), null, JSON.stringify(bad));
  }
  assert.equal(parseClientMessage('{'), null);
});
