import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sortCommands } from '../src/commands/help.js';
import type { Command } from '../src/commands/types.js';

const command = (name: string): Command => ({ name, description: '', execute: async () => {} });

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
