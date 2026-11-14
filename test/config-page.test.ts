import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FIELD_MAX_LENGTH, TEXT, validateConstants } from '../src/constants/index.js';
import { buildConfigPages, type ConfigGroup } from '../src/lib/config-page.js';

const group = (name: string, lineCount: number, lineLength = 20): ConfigGroup => ({
  name,
  lines: Array.from({ length: lineCount }, (_, i) => `${name} setting ${i}: `.padEnd(lineLength, 'x')),
});

const allText = (pages: ReturnType<typeof buildConfigPages>) => pages.flat().map((f) => `${f.name}\n${f.value}`).join('\n');

test('config pages: each group is its own page, named for the group, even when several groups would easily fit together', () => {
  validateConstants();
  const groups = [group('General', 2), group('Claim', 2), group('Gacha', 2)];
  const pages = buildConfigPages(groups);
  assert.equal(pages.length, 3, 'one page per group, not packed together');
  assert.deepEqual(
    pages.map((p) => p.map((f) => f.name)),
    [['General'], ['Claim'], ['Gacha']],
  );
  for (const g of groups) for (const line of g.lines) assert.ok(allText(pages).includes(line), `missing: ${line}`);
});

test('config pages: an empty group contributes no page', () => {
  const pages = buildConfigPages([group('General', 2), { name: 'Empty', lines: [] }, group('Claim', 1)]);
  assert.deepEqual(
    pages.map((p) => p.map((f) => f.name)),
    [['General'], ['Claim']],
  );
});

test('config pages: no groups at all means no pages', () => {
  assert.deepEqual(buildConfigPages([]), []);
});

test('config pages: a group longer than the field limit gets its own numbered run of pages instead of losing content', () => {
  // Many lines, each well within the field limit alone, but the group's combined text is not.
  const big = group('Rob', 200, 30);
  const pages = buildConfigPages([big]);
  assert.ok(pages.length > 1, 'the oversized group split into more than one page');
  for (const page of pages) {
    assert.equal(page.length, 1, 'one field per page, even for a split group');
    assert.ok(page[0]!.value.length <= FIELD_MAX_LENGTH, `field of ${page[0]!.value.length} chars`);
  }
  for (const [i, page] of pages.entries()) assert.equal(page[0]!.name, TEXT.config.groupFieldPage('Rob', i + 1, pages.length));
  const text = allText(pages);
  for (const line of big.lines) assert.ok(text.includes(line), 'missing line from split group');
});

test('config pages: a tiny field limit still keeps every line whole, using more pages rather than truncating', () => {
  const g = group('Plinko', 5, 50);
  const oneLineLength = g.lines[0]?.length ?? 0;
  const pages = buildConfigPages([g], oneLineLength + 5);
  const text = allText(pages);
  for (const line of g.lines) assert.ok(text.includes(line), `${line} is not cut off`);
  for (const page of pages) for (const field of page) assert.ok(field.value.length <= oneLineLength + 5);
});

test('config pages: only a group that needed more than one page gets a "page x/y" name; a group that fits keeps its plain name', () => {
  const pages = buildConfigPages([group('Equipment', 2), group('Rob', 200, 30)]);
  const names = pages.flat().map((f) => f.name);
  assert.ok(names.includes('Equipment'), 'a group that fits keeps its plain name');
  assert.ok(names.some((n) => n.startsWith('Rob — page ')), 'the oversized group is numbered');
  assert.ok(!names.includes('Rob'), 'the oversized group never appears under its bare name');
});

test('config pages: several small groups produce that many separate, individually flippable pages', () => {
  const groups = ['General', 'Claim', 'Gacha', 'Sell', 'Rob', 'Plinko', 'Blackjack', 'Events', 'Equipment'].map((name) => group(name, 2));
  const pages = buildConfigPages(groups);
  assert.equal(pages.length, groups.length, 'every group gets its own page');
});
