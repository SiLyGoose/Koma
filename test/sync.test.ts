import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { SIM_VERSION } from '../src/lib/game/technomagic.js';

/*
 * What the bot and the site (the Koma-UI repo, beside this one) share is kept the same by the site's `yarn sync`:
 * the sim, which is the site's (the bot's vendor/technomagic-sim.mjs is built from it), and what the two say to each
 * other, which is the bot's (src/protocol/, which the site copies). With the site's repo beside this one, these say
 * when either is out of date; without it, there is nothing to check against.
 */

const SITE = new URL('../../Koma-UI/', import.meta.url);
const there = existsSync(new URL('package.json', SITE));
const skip = there ? false : 'the Koma-UI repo is not beside this one';

test("sync: the bot's sim is the site's (its version is the site's sim's hash)", { skip }, async () => {
  const { simVersion } = (await import(pathToFileURL(new URL('scripts/sim-version.mjs', SITE).pathname.slice(1)).href)) as { simVersion: (dir: string) => string };
  const site = simVersion(new URL('src/technomagic/sim/', SITE).pathname.slice(1));
  assert.equal(SIM_VERSION, site, 'vendor/ is out of date: run `yarn sync` in Koma-UI');
});

test("sync: the site's copy of src/protocol/ is this one", { skip }, () => {
  const ours = new URL('../src/protocol/', import.meta.url);
  const theirs = new URL('src/protocol/', SITE);
  const files = readdirSync(ours).filter((file) => file.endsWith('.ts'));
  const read = (url: URL): string => readFileSync(url, 'utf8').replaceAll('\r\n', '\n');
  assert.deepEqual(existsSync(theirs) ? readdirSync(theirs).sort() : [], [...files].sort(), "the site's src/protocol/ has other files: run `yarn sync` in Koma-UI");
  for (const file of files) {
    // (Its copy says where it is from, and names its files as the site does: without `.js`.)
    const copy = read(new URL(file, theirs)).replace(/^\/\/.*\n/, '');
    assert.equal(copy, read(new URL(file, ours)).replace(/(from '\.\/[\w-]+)\.js'/g, "$1'"), `${file} is out of date in the site: run \`yarn sync\` in Koma-UI`);
  }
});
