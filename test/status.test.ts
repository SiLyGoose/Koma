import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STATUS, TEXT } from '../src/constants/index.js';
import { formatUptime, statusLine } from '../src/discord/status.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

test('status: the uptime is its two biggest units, rounded down', () => {
  assert.equal(formatUptime(0), '0m');
  assert.equal(formatUptime(12 * MINUTE + 59_000), '12m');
  assert.equal(formatUptime(4 * HOUR + 12 * MINUTE), '4h 12m');
  assert.equal(formatUptime(HOUR), '1h 0m');
  assert.equal(formatUptime(3 * DAY + 4 * HOUR + 59 * MINUTE), '3d 4h');
});

test('status: just woke up for the first minute, then the uptime in a line that changes every so often', () => {
  assert.equal(statusLine(0), TEXT.status.justWoke);
  assert.equal(statusLine(59_000), TEXT.status.justWoke);
  assert.equal(statusLine(5 * MINUTE), TEXT.status.lines[0]!('5m'));
  assert.equal(statusLine(STATUS.rotateMs + MINUTE), TEXT.status.lines[1]!(formatUptime(STATUS.rotateMs + MINUTE)));
  // Back to the first line once every one has had its turn.
  const lap = STATUS.rotateMs * TEXT.status.lines.length;
  assert.equal(statusLine(lap + MINUTE), TEXT.status.lines[0]!(formatUptime(lap + MINUTE)));
});

test('status: every line fits in a status (128 characters), even after a long time up', () => {
  for (const line of TEXT.status.lines) assert.ok(line(formatUptime(999 * DAY + 23 * HOUR)).length <= 128);
  assert.ok(TEXT.status.justWoke.length <= 128);
});
