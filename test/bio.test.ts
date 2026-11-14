import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BIO } from '../src/constants/index.js';
import { withSiteLine } from '../src/discord/bio.js';

const site = 'https://koma.example';
const line = `${BIO.siteLabel} ${site}`;

test('bio: the site line is added to an empty bio, or below what is written', () => {
  assert.equal(withSiteLine('', site), line);
  assert.equal(withSiteLine('A Discord RPG bot.\n', site), `A Discord RPG bot.\n\n${line}`);
});

test('bio: an old site line gets the new address, and the rest is left alone', () => {
  const bio = `A Discord RPG bot.\n${BIO.siteLabel} https://old.example\nHave fun!`;
  assert.equal(withSiteLine(bio, site), `A Discord RPG bot.\n${line}\nHave fun!`);
});

test('bio: a bio already pointing at the site is unchanged', () => {
  const bio = `A Discord RPG bot.\n\n${line}`;
  assert.equal(withSiteLine(bio, site), bio);
});
