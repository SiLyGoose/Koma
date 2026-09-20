import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCommand, parseUserArg } from '../src/lib/parse.js';

test('parseCommand splits the name and arguments, ignoring case', () => {
  assert.deepEqual(parseCommand('!claim', '!'), { name: 'claim', args: [] });
  assert.deepEqual(parseCommand('!ROB <@123456789012345678>', '!'), { name: 'rob', args: ['<@123456789012345678>'] });
  assert.deepEqual(parseCommand('!inv   <@123456789012345678>  extra', '!'), {
    name: 'inv',
    args: ['<@123456789012345678>', 'extra'],
  });
});

test('parseCommand ignores messages that are not commands', () => {
  assert.equal(parseCommand('hello', '!'), null);
  assert.equal(parseCommand('!', '!'), null);
  assert.equal(parseCommand('! claim', '!'), null);
  assert.equal(parseCommand('  !claim', '!'), null);
});

test('parseCommand supports multi-character prefixes', () => {
  assert.deepEqual(parseCommand('k!claim', 'k!'), { name: 'claim', args: [] });
  assert.equal(parseCommand('!claim', 'k!'), null);
});

test('the prefix is not case-sensitive', () => {
  for (const content of ['k!claim', 'K!claim', 'K!CLAIM', 'k!Claim', 'K!cLaIm']) {
    assert.deepEqual(parseCommand(content, 'k!'), { name: 'claim', args: [] }, content);
  }
  // Works whichever case the stored prefix is in.
  assert.deepEqual(parseCommand('k!claim', 'K!'), { name: 'claim', args: [] });
  assert.deepEqual(parseCommand('KOMA claim', 'koma '), { name: 'claim', args: [] });
  // Still needs the whole prefix, and a command right after it.
  assert.equal(parseCommand('K claim', 'k!'), null);
  assert.equal(parseCommand('K! claim', 'k!'), null);
  assert.equal(parseCommand('K!', 'k!'), null);
});

test('arguments keep the case they were typed in', () => {
  assert.deepEqual(parseCommand('K!EQUIP Iron Longsword', 'k!'), { name: 'equip', args: ['Iron', 'Longsword'] });
  assert.deepEqual(parseCommand('K!Config set embedColor #AbCdEf', 'k!'), {
    name: 'config',
    args: ['set', 'embedColor', '#AbCdEf'],
  });
});

test('parseUserArg accepts mentions and raw ids only', () => {
  assert.equal(parseUserArg('<@123456789012345678>'), '123456789012345678');
  assert.equal(parseUserArg('<@!123456789012345678>'), '123456789012345678');
  assert.equal(parseUserArg('123456789012345678'), '123456789012345678');
  assert.equal(parseUserArg('someone'), null);
  assert.equal(parseUserArg('<@&123456789012345678>'), null); // role mention
  assert.equal(parseUserArg('<#123456789012345678>'), null); // channel mention
  assert.equal(parseUserArg('12345'), null);
  assert.equal(parseUserArg(undefined), null);
});
