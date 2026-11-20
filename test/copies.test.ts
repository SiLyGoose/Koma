import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bestCopy, groupCopies, newCopyId, stackCopies } from '../src/lib/game/items/copies.js';

const at = (minutes: number) => new Date(Date.UTC(2026, 8, 20, 0, minutes));
const copy = (_id: string, level: number, minutes: number, itemId = 'sword') => ({ _id, itemId, level, obtainedAt: at(minutes) });

test('copy ids are 24 hex characters and do not repeat', () => {
  const ids = new Set(Array.from({ length: 1000 }, () => newCopyId()));
  assert.equal(ids.size, 1000);
  for (const id of ids) assert.match(id, /^[0-9a-f]{24}$/);
});

test('groupCopies counts copies per item and keeps the best level', () => {
  const entries = groupCopies([
    copy('a', 0, 5, 'sword'),
    copy('b', 2, 9, 'sword'),
    copy('c', 0, 1, 'shield'),
    copy('d', 1, 7, 'sword'),
  ]);
  assert.deepEqual(entries, [
    { itemId: 'shield', count: 1, bestLevel: 0 },
    { itemId: 'sword', count: 3, bestLevel: 2 },
  ]);
});

test('groupCopies handles nothing at all', () => {
  assert.deepEqual(groupCopies([]), []);
});

test('bestCopy prefers the highest level, then the oldest, then the lowest id', () => {
  assert.equal(bestCopy([]), undefined);
  assert.equal(bestCopy([copy('a', 0, 5)])?._id, 'a');
  assert.equal(bestCopy([copy('a', 0, 5), copy('b', 2, 9), copy('c', 1, 1)])?._id, 'b');
  assert.equal(bestCopy([copy('a', 1, 9), copy('b', 1, 2), copy('c', 1, 5)])?._id, 'b');
  assert.equal(bestCopy([copy('z', 1, 2), copy('m', 1, 2), copy('q', 1, 2)])?._id, 'm');
});

test('bestCopy does not depend on the order it is given', () => {
  const copies = [copy('a', 1, 9), copy('b', 2, 3), copy('c', 2, 1), copy('d', 0, 0)];
  const expected = bestCopy(copies)?._id;
  assert.equal(expected, 'c');
  assert.equal(bestCopy([...copies].reverse())?._id, expected);
  assert.equal(bestCopy([copies[2]!, copies[0]!, copies[3]!, copies[1]!])?._id, expected);
});

test('stackCopies: copies that differ in level, lock or being worn get lines of their own', () => {
  const stacks = stackCopies(
    [
      copy('a', 1, 1),
      copy('b', 0, 2), // level 0 counts as R1
      { ...copy('c', 1, 3), locked: true },
      copy('d', 3, 4),
      copy('worn', 1, 5),
      copy('e', 1, 6, 'shield'),
    ],
    new Set(['worn']),
  );
  assert.deepEqual(stacks, [
    { itemId: 'sword', level: 1, locked: false, worn: true, count: 1 },
    { itemId: 'sword', level: 3, locked: false, worn: false, count: 1 },
    { itemId: 'sword', level: 1, locked: true, worn: false, count: 1 },
    { itemId: 'sword', level: 1, locked: false, worn: false, count: 2 },
    { itemId: 'shield', level: 1, locked: false, worn: false, count: 1 },
  ]);
});
