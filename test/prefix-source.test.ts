import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isLocalMode, resolvePrefixSource, slashCommandsEnabled } from '../src/lib/prefix-source.js';

test('ENV=LOCAL reads the prefix from DS_PREFIX', () => {
  assert.deepEqual(resolvePrefixSource({ ENV: 'LOCAL', DS_PREFIX: 'dev.' }), { source: 'env', prefix: 'dev.' });
});

test('LOCAL is not case sensitive, and stray spaces are ignored', () => {
  assert.deepEqual(resolvePrefixSource({ ENV: ' local ', DS_PREFIX: '  t!  ' }), { source: 'env', prefix: 't!' });
  assert.deepEqual(resolvePrefixSource({ ENV: 'Local', DS_PREFIX: 't!' }), { source: 'env', prefix: 't!' });
});

test('anything other than LOCAL reads the prefix from MongoDB, even if DS_PREFIX is set', () => {
  for (const env of [
    { ENV: 'PROD', DS_PREFIX: 'dev.' },
    { ENV: 'production' },
    { ENV: 'staging', DS_PREFIX: 'x' },
    { ENV: '' },
    { DS_PREFIX: 'dev.' },
    {},
  ]) {
    assert.deepEqual(resolvePrefixSource(env), { source: 'database' }, JSON.stringify(env));
  }
});

test('ENV=LOCAL without a usable DS_PREFIX stops with a message that says what to add', () => {
  assert.throws(() => resolvePrefixSource({ ENV: 'LOCAL' }), /DS_PREFIX is missing or empty/);
  assert.throws(() => resolvePrefixSource({ ENV: 'LOCAL', DS_PREFIX: '   ' }), /DS_PREFIX is missing or empty/);
  assert.throws(() => resolvePrefixSource({ ENV: 'LOCAL', DS_PREFIX: 'has space' }), /DS_PREFIX in \.env must be/);
  assert.throws(() => resolvePrefixSource({ ENV: 'LOCAL', DS_PREFIX: 'waytoolongprefix' }), /DS_PREFIX in \.env must be/);
});

test('slash commands are off with ENV=LOCAL (any letter case) and on for everything else', () => {
  for (const env of [{ ENV: 'LOCAL', DS_PREFIX: 'd.' }, { ENV: ' local ' }, { ENV: 'Local' }]) {
    assert.equal(isLocalMode(env), true, JSON.stringify(env));
    assert.equal(slashCommandsEnabled(env), false, JSON.stringify(env));
  }
  for (const env of [{ ENV: 'PROD' }, { ENV: 'production' }, { ENV: '' }, { DS_PREFIX: 'd.' }, {}]) {
    assert.equal(isLocalMode(env), false, JSON.stringify(env));
    assert.equal(slashCommandsEnabled(env), true, JSON.stringify(env));
  }
});
