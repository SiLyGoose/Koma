import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { ADMIN_USER_ID, CONFIG, DEFAULTS } from '../src/config.js';
import { CURRENCY_EMOJI } from '../src/constants/index.js';
import { getPath, GROUPS, SPECS } from '../src/lib/settings-spec.js';
import { changeSettings } from '../src/services/settings.js';
import type { SettingsSaved, SettingsView } from '../src/protocol/admin.js';
import { createApi, type ApiDeps } from '../src/web/api.js';
import { signSession } from '../src/web/auth/login.js';
import { signToken } from '../src/web/auth/token.js';
import type { WebConfig } from '../src/web/config.js';
import type { SettingsStore } from '../src/web/services/admin.js';

const SITE: WebConfig = {
  siteUrl: 'https://koma-ui.vercel.app',
  origin: 'https://koma-ui.vercel.app',
  apiUrl: 'https://koma.duckdns.org',
  socketUrl: 'wss://koma.duckdns.org',
  port: 0,
  clientSecret: 'shh',
};

test('admin settings: several changed at once are checked together, and none is saved if any is wrong', async () => {
  // Not the admin: nothing is looked at.
  assert.deepEqual(await changeSettings('someone', { 'claim.min': '1' }), { ok: false, reason: 'forbidden' });

  // Every bad value is said, not only the first.
  const bad = await changeSettings(ADMIN_USER_ID, { 'claim.min': 'lots', 'rob.successChance': '140%', 'nope.nothing': '3' });
  assert.equal(bad.ok, false);
  assert.deepEqual(
    !bad.ok && bad.reason === 'invalid' ? bad.problems.map((problem) => problem.key) : null,
    ['claim.min', 'rob.successChance', 'nope.nothing'],
  );

  // Raising claim.min past claim.max breaks a rule: the rule is the problem, of no one setting.
  const rule = await changeSettings(ADMIN_USER_ID, { 'claim.min': String(CONFIG.claim.max + 1) });
  assert.equal(rule.ok, false);
  assert.deepEqual(!rule.ok && rule.reason === 'invalid' ? rule.problems.map((problem) => problem.key) : null, [null]);
  assert.equal(CONFIG.claim.min, DEFAULTS.claim.min);

  // Nothing to change: nothing written.
  assert.deepEqual(await changeSettings(ADMIN_USER_ID, {}), { ok: true, results: [] });
});

test('admin web: only the bot admin, logged in, sees and changes the settings; /api/me says who is', async () => {
  const calls: string[] = [];
  const store: SettingsStore = {
    change: async (actorId, changes) => {
      calls.push(`change ${actorId} ${JSON.stringify(changes)}`);
      if ('claim.min' in changes && changes['claim.min'] === '9999999') return { ok: false, reason: 'invalid', problems: [{ key: null, error: 'That would break a rule: claim.min cannot be higher than claim.max.' }] };
      return { ok: true, results: Object.entries(changes).map(([key, value]) => ({ key, oldValue: 'before', newValue: value })) };
    },
    prefixFromEnv: () => true,
  };
  const deps: ApiDeps = {
    config: SITE,
    clientId: () => '999',
    guild: (id) => (id === 'g1' ? { name: id, icon: null } : null),
    memberName: async () => 'ZEIU',
    balance: async () => 0,
    settings: store,
  };
  const as = (userId: string) => ({ Origin: SITE.origin, 'Content-Type': 'application/json', Authorization: `Bearer ${signSession({ userId, name: 'ZEIU', avatar: null, guildIds: ['g1'] }, 'shh')}` });
  const admin = as(ADMIN_USER_ID);
  const member = as('123');

  const server: Server = createServer(createApi(deps));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, headers: Record<string, string>, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  try {
    // /api/me: whether they're the admin, for the site to offer the page.
    assert.equal(((await (await fetch(`${base}/api/me`, { headers: admin })).json()) as { admin: boolean }).admin, true);
    assert.equal(((await (await fetch(`${base}/api/me`, { headers: member })).json()) as { admin: boolean }).admin, false);

    // Every setting, in the config command's groups' order, with its value and default; the points emoji in words.
    const get = await fetch(`${base}/api/admin/settings`, { headers: admin });
    assert.equal(get.status, 200);
    const view = (await get.json()) as SettingsView;
    assert.deepEqual(view.groups, GROUPS);
    assert.deepEqual(view.settings.map((setting) => setting.key), SPECS.map((spec) => spec.key));
    for (const setting of view.settings) {
      assert.equal(setting.value, getPath(CONFIG, setting.key));
      assert.equal(setting.default, getPath(DEFAULTS, setting.key));
      assert.ok(!setting.description.includes(CURRENCY_EMOJI), setting.key);
    }
    const chance = view.settings.find((setting) => setting.key === 'rob.successChance');
    assert.deepEqual(chance && { min: chance.min, max: chance.max, percent: chance.percent, shown: chance.shown }, { min: 0, max: 1, percent: true, shown: '50%' });
    assert.match(view.settings.find((setting) => setting.key === 'claim.min')?.description ?? '', /points/);
    assert.match(view.settings.find((setting) => setting.key === 'sell.technomagic')?.description ?? '', /^Points for selling/);
    // The prefix, from the bot's .env: shown, but not to be changed here.
    assert.ok(view.settings.find((setting) => setting.key === 'prefix')?.locked);
    assert.equal(view.settings.find((setting) => setting.key === 'claim.min')?.locked, undefined);

    // Changes, as typed, go to the store as the admin; the answer has the settings and what changed.
    const saved = await post('/api/admin/settings', admin, { changes: { 'claim.min': '150', 'rob.successChance': '40%' } });
    assert.equal(saved.status, 200);
    const body = (await saved.json()) as SettingsSaved;
    assert.deepEqual(body.changed, [
      { key: 'claim.min', oldValue: 'before', newValue: '150' },
      { key: 'rob.successChance', oldValue: 'before', newValue: '40%' },
    ]);
    assert.equal(body.settings.settings.length, SPECS.length);

    // One that can't be made: 400, with the problems.
    const broken = await post('/api/admin/settings', admin, { changes: { 'claim.min': '9999999' } });
    assert.equal(broken.status, 400);
    assert.deepEqual(await broken.json(), { error: 'invalid_setting', problems: [{ key: null, error: 'That would break a rule: claim.min cannot be higher than claim.max.' }] });

    // Bodies that aren't what they should be.
    assert.equal((await post('/api/admin/settings', admin, { changes: { 'claim.min': 150 } })).status, 400);
    assert.equal((await post('/api/admin/settings', admin, {})).status, 400);
    assert.equal((await post('/api/admin/settings', admin, { changes: [] })).status, 400);

    // Anyone else: not_admin, whatever they ask. Not logged in: 401; and a game link, even the admin's, isn't a login.
    for (const res of [
      await fetch(`${base}/api/admin/settings`, { headers: member }),
      await post('/api/admin/settings', member, { changes: { 'claim.min': '1' } }),
    ]) {
      assert.equal(res.status, 403);
      assert.deepEqual(await res.json(), { error: 'not_admin' });
    }
    assert.equal((await fetch(`${base}/api/admin/settings`, { headers: { Origin: SITE.origin } })).status, 401);
    const link = signToken({ guildId: 'g1', userId: ADMIN_USER_ID, name: 'ZEIU' }, 60_000);
    assert.equal((await fetch(`${base}/api/admin/settings`, { headers: { Origin: SITE.origin, Authorization: `Game ${link}` } })).status, 401);

    assert.deepEqual(calls, [
      `change ${ADMIN_USER_ID} {"claim.min":"150","rob.successChance":"40%"}`,
      `change ${ADMIN_USER_ID} {"claim.min":"9999999"}`,
    ]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
