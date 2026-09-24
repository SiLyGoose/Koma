import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULTS } from '../src/config.js';
import { CODE, CODE_LENGTH, HEIST, SPLIT_STEAL, TEXT, validateConstants } from '../src/constants/index.js';
import { codeEmbed, codeResultEmbed, codedle, guessRow, myBoardText, squares, type CodeGuess } from '../src/events/codedle.js';
import { GAME_EVENTS, validateEvents } from '../src/events/registry.js';
import { parseGuess, rollCode, scoreGuess } from '../src/lib/events/code.js';
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

test('codedle constants pass the startup check, and its button ids are unique', () => {
  validateConstants();
  const ids = [CODE.guessId, CODE.mineId, HEIST.joinId, HEIST.escapeId, SPLIT_STEAL.joinId, SPLIT_STEAL.splitId, SPLIT_STEAL.stealId];
  assert.equal(new Set(ids).size, ids.length);
  const buttons = guessRow().toJSON().components as { custom_id: string }[];
  assert.deepEqual(buttons.map((b) => b.custom_id), [CODE.guessId, CODE.mineId]);
});

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

const guess = (userId: string, code: string, g: string): CodeGuess => ({ userId, guess: g, marks: scoreGuess(code, g) });

test("live screen: prize, cost and a guess count, but nobody's guesses or hints", () => {
  const empty = data(codeEmbed(5000, 10, 1_700_000_000, []));
  assert.equal(empty.title, TEXT.codedle.title);
  assert.match(empty.description ?? '', /5,000/);
  assert.match(empty.description ?? '', /5-digit/);
  assert.match(empty.description ?? '', /<t:1700000000:R>/);
  assert.match(data(codeEmbed(5000, 0, 1, [])).description ?? '', /free/);

  const live = data(codeEmbed(5000, 10, 1, [guess('1', '12345', '67890')]));
  assert.equal(live.fields?.length ?? 0, 0, 'no board on the public screen');
  assert.doesNotMatch(JSON.stringify(live), /67890/);
  assert.equal(live.footer?.text, TEXT.codedle.guessCount(1));
});

test('my guesses: only the asker\'s own guesses and hints, without names', () => {
  const guesses = [guess('1', '12345', '67890'), guess('2', '12345', '12399'), guess('1', '12345', '15000')];
  const mine = myBoardText(guesses, '1');
  assert.equal(mine, [TEXT.codedle.mineTitle(2), '⬛⬛⬛⬛⬛ `67890`', '🟩🟨⬛⬛⬛ `15000`'].join('\n'));
  assert.doesNotMatch(mine, /12399|<@/, 'nobody else\'s guesses, and no mentions');
  assert.equal(myBoardText(guesses, '3'), TEXT.codedle.mineEmpty);
});

test('my guesses: only the most recent, with a count of older ones', () => {
  const many = Array.from({ length: CODE.boardMax + 3 }, (_, i) => guess('1', '99999', String(i).padStart(5, '0')));
  const lines = myBoardText(many, '1').split('\n');
  assert.equal(lines.filter((line) => /`\d{5}`/.test(line)).length, CODE.boardMax);
  assert.ok(lines.some((line) => /3 older guesses/.test(line)));
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
  // Once it's over, the full board is revealed with who guessed what.
  assert.equal(won.fields?.[0]?.value, '🟨⬛⬛🟨⬛ `12345` <@1>\n🟩🟩🟩🟩🟩 `04471` <@2>');
});
