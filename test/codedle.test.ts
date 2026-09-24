import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULTS } from '../src/config.js';
import { CODE, CODE_LENGTH, HEIST, SPLIT_STEAL, TEXT, validateConstants } from '../src/constants/index.js';
import { codeEmbed, codeResultEmbed, codedle, guessRow, squares, type CodeGuess } from '../src/events/codedle.js';
import { GAME_EVENTS, validateEvents } from '../src/events/registry.js';
import { parseGuess, rollCode, ruledOut, scoreGuess } from '../src/lib/events/code.js';
import { findSpec, parseInput, validateSettings } from '../src/lib/settings-spec.js';

const data = (embed: { toJSON(): unknown }) =>
  embed.toJSON() as { title?: string; description?: string; fields?: { name: string; value: string }[]; footer?: { text: string } };

/** Scores as squares, for short assertions. */
const s = (code: string, guess: string) => squares(scoreGuess(code, guess));

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

test('code: 5 digits, repeats and leading zeros allowed', () => {
  assert.equal(CODE_LENGTH, 5);
  const digits = [0, 4, 4, 7, 1];
  assert.equal(rollCode(5, () => digits.shift() as number), '04471');
  for (let i = 0; i < 200; i++) assert.match(rollCode(5), /^\d{5}$/);
});

test('guess: exactly 5 digits, spaces and dashes between them ignored', () => {
  assert.equal(parseGuess('12345', 5), '12345');
  assert.equal(parseGuess(' 12 3-45 ', 5), '12345');
  assert.equal(parseGuess('00000', 5), '00000');
  for (const bad of ['1234', '123456', '12a45', '', '１２３４５']) assert.equal(parseGuess(bad, 5), null, bad);
});

test('score: hits, nears and misses', () => {
  assert.equal(s('12345', '12345'), '🟩🟩🟩🟩🟩');
  assert.equal(s('12345', '67890'), '⬛⬛⬛⬛⬛');
  assert.equal(s('12345', '51234'), '🟨🟨🟨🟨🟨');
  assert.equal(s('12345', '13579'), '🟩🟨🟨⬛⬛');
});

test('score: a digit is never counted more often than the code has it', () => {
  // The code has one 1: the hit takes it, so the other 1s are misses.
  assert.equal(s('10000', '11111'), '🟩⬛⬛⬛⬛');
  // The code has one 4 (not in the right spot): only the first extra 4 is near.
  assert.equal(s('40000', '04444'), '🟨🟨⬛⬛⬛');
  // Two 4s in the code, one guessed in place and one elsewhere.
  assert.equal(s('44120', '42400'), '🟩🟨🟨⬛🟩');
  // Hits are matched before nears, even when the near comes first.
  assert.equal(s('12344', '44444'), '⬛⬛⬛🟩🟩');
});

test('ruled out: only digits that missed and never scored anywhere', () => {
  const guesses = [
    { guess: '11111', marks: scoreGuess('10000', '11111') },
    { guess: '23456', marks: scoreGuess('10000', '23456') },
  ];
  // 1 missed four times but hit once, so it is still in play.
  assert.deepEqual(ruledOut(guesses), ['2', '3', '4', '5', '6']);
  assert.deepEqual(ruledOut([]), []);
});

// ---------------------------------------------------------------------------
// Registry, settings, constants
// ---------------------------------------------------------------------------

test('codedle is in the event list', () => {
  validateEvents();
  assert.ok(GAME_EVENTS.includes(codedle));
  assert.equal(codedle.id, 'codedle');
});

test('codedle settings: defaults valid, in the Events group, held to their limits', () => {
  assert.deepEqual(validateSettings(structuredClone(DEFAULTS)), []);
  assert.equal(DEFAULTS.events.codedle.seconds, 300);
  assert.equal(DEFAULTS.events.codedle.guessCost, 10);
  const seconds = findSpec('events.codedle.seconds');
  const cost = findSpec('events.codedle.guessCost');
  assert.ok(seconds && cost);
  assert.equal(seconds.group, 'Events');
  assert.equal(parseInput(seconds, '10').ok, false, 'too short to play');
  assert.deepEqual(parseInput(cost, '0'), { ok: true, value: 0 }, 'free guessing is allowed');
  assert.equal(parseInput(cost, '-1').ok, false);
});

test('codedle constants pass the startup check, and its button id is unique', () => {
  validateConstants();
  const ids = [CODE.guessId, HEIST.joinId, HEIST.escapeId, SPLIT_STEAL.joinId, SPLIT_STEAL.splitId, SPLIT_STEAL.stealId];
  assert.equal(new Set(ids).size, ids.length);
  assert.equal((guessRow().toJSON().components[0] as { custom_id: string }).custom_id, CODE.guessId);
});

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

const guess = (userId: string, code: string, g: string): CodeGuess => ({ userId, guess: g, marks: scoreGuess(code, g) });

test('live screen: prize, cost, board with hints, and ruled-out digits', () => {
  const empty = data(codeEmbed(5000, 10, 1_700_000_000, []));
  assert.equal(empty.title, TEXT.codedle.title);
  assert.match(empty.description ?? '', /5,000/);
  assert.match(empty.description ?? '', /5-digit/);
  assert.match(empty.description ?? '', /<t:1700000000:R>/);
  assert.equal(empty.fields?.[0]?.value, TEXT.codedle.boardEmpty);
  assert.equal(empty.fields?.length, 1, 'nothing ruled out yet');
  assert.match(data(codeEmbed(5000, 0, 1, [])).description ?? '', /free/);

  const live = data(codeEmbed(5000, 10, 1, [guess('1', '12345', '67890')]));
  assert.equal(live.fields?.[0]?.value, '⬛⬛⬛⬛⬛ `67890` <@1>');
  assert.equal(live.fields?.[1]?.value, '0 6 7 8 9');
  assert.equal(live.footer?.text, TEXT.codedle.guessCount(1));
});

test('board: only the most recent guesses, with a count of older ones', () => {
  const many = Array.from({ length: CODE.boardMax + 3 }, (_, i) => guess('1', '99999', String(i).padStart(5, '0')));
  const board = data(codeEmbed(1, 0, 1, many)).fields?.[0]?.value ?? '';
  assert.equal(board.split('\n').length, CODE.boardMax + 1);
  assert.match(board, /3 older guesses/);
});

test('result: the winner and the code, or the code revealed when nobody got it', () => {
  const guesses = [guess('1', '04471', '12345'), guess('2', '04471', '04471')];
  const won = data(codeResultEmbed('04471', 5000, guesses, '2'));
  assert.equal(won.title, TEXT.codedle.crackedTitle);
  assert.match(won.description ?? '', /<@2> cracked the code `04471`/);
  assert.match(won.description ?? '', /\*\*2\*\* guesses/);

  const lost = data(codeResultEmbed('04471', 5000, guesses.slice(0, 1), null));
  assert.equal(lost.title, TEXT.codedle.lockedTitle);
  assert.match(lost.description ?? '', /`04471`/);
});
