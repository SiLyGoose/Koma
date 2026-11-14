import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findCommand, groupCommands, pageGroups, sortCommands } from '../src/commands/help.js';
import { commands } from '../src/commands/index.js';
import { COMMAND_CATEGORIES, HELP_PAGE_SIZE, type CommandCategory } from '../src/constants/index.js';
import type { Command } from '../src/discord/types.js';

const command = (name: string, category: CommandCategory = 'bot'): Command => ({ name, category, description: '', execute: async () => {} });

test('help: commands are listed alphabetically, ignoring case, without changing the original list', () => {
  const original = ['rob', 'claim', 'Gear', 'balance', 'databank', 'help', 'give'].map(command);
  const before = original.map((c) => c.name);
  assert.deepEqual(
    sortCommands(original).map((c) => c.name),
    ['balance', 'claim', 'databank', 'Gear', 'give', 'help', 'rob'],
  );
  assert.deepEqual(original.map((c) => c.name), before);
  assert.deepEqual(sortCommands([]), []);
});

test('help: commands are grouped in the categories’ order, each group alphabetical, empty groups left out', () => {
  const groups = groupCommands([command('rob', 'economy'), command('roulette', 'casino'), command('claim', 'economy'), command('help', 'bot')]);
  assert.deepEqual(
    groups.map((g) => [g.category, g.commands.map((c) => c.name)]),
    [
      ['economy', ['claim', 'rob']],
      ['casino', ['roulette']],
      ['bot', ['help']],
    ],
  );
  // Every real command is in a real group, and each group has some.
  for (const c of commands) assert.ok(c.category in COMMAND_CATEGORIES, c.name);
  for (const category of Object.keys(COMMAND_CATEGORIES)) assert.ok(commands.some((c) => c.category === category), `${category} has commands`);
});

test('help: pages hold up to 10 commands, never splitting a group unless it alone has more', () => {
  assert.equal(HELP_PAGE_SIZE, 10);
  const many = (category: CommandCategory, n: number) => Array.from({ length: n }, (_, i) => command(`${category}${String(i).padStart(2, '0')}`, category));
  const pages = pageGroups(groupCommands([...many('economy', 5), ...many('casino', 5), ...many('items', 6), ...many('gear', 4), ...many('adventure', 13)]));
  const shape = pages.map((page) => page.map((g) => `${g.category}:${g.commands.length}`));
  assert.deepEqual(shape, [['economy:5', 'casino:5'], ['items:6', 'gear:4'], ['adventure:10'], ['adventure:3']]);
  assert.deepEqual(pageGroups([]), []);
  // Every real command is on some page, once.
  const listed = pageGroups(groupCommands(commands)).flat().flatMap((g) => g.commands.map((c) => c.name));
  assert.deepEqual([...listed].sort(), commands.map((c) => c.name).sort());
});

test('help: one command is found by its name or an alias, ignoring case and a typed prefix', () => {
  assert.equal(findCommand(commands, 'blackjack')?.name, 'blackjack');
  assert.equal(findCommand(commands, 'BJ')?.name, 'blackjack');
  assert.equal(findCommand(commands, 'k!lb', 'k!')?.name, 'leaderboard');
  assert.equal(findCommand(commands, '/roulette', 'k!')?.name, 'roulette');
  assert.equal(findCommand(commands, 'commands')?.name, 'help');
  assert.equal(findCommand(commands, 'nope'), undefined);
});
