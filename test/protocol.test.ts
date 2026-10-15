import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

/*
 * src/protocol/ is what the bot and the site's pages say to each other, and the site keeps a copy of it (Koma-UI's
 * `yarn sync`): so its files name nothing outside it, and hold nothing but shapes and plain lists.
 */

const DIR = new URL('../src/protocol/', import.meta.url);
const files = readdirSync(DIR).filter((file) => file.endsWith('.ts'));

test('protocol: its files name nothing but each other', () => {
  assert.ok(files.length > 0);
  for (const file of files) {
    const text = readFileSync(new URL(file, DIR), 'utf8');
    for (const [, from] of text.matchAll(/^(?:import|export)\b[^;]*?\bfrom '([^']+)'/gm)) {
      assert.match(from as string, /^\.\/[\w-]+\.js$/, `${file} names ${from}`);
    }
  }
});

test('protocol: its files hold shapes and plain lists, nothing that runs', () => {
  for (const file of files) {
    const text = readFileSync(new URL(file, DIR), 'utf8');
    assert.doesNotMatch(text, /^export (?:async )?function\b|^export class\b|^(?:export )?const \w+ = (?!\[)/m, `${file} holds code`);
  }
});
