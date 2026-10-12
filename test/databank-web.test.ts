import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import { RAID_BOSS_IDS, RAID_DIFFICULTY, REFINE, TEXT } from '../src/constants/index.js';
import { ITEMS } from '../src/data/items.js';
import { describeEffects } from '../src/lib/game/items/equipment.js';
import { signSession } from '../src/web/auth/login.js';
import { createApi } from '../src/web/api.js';
import type { WebConfig } from '../src/web/config.js';
import { databankView } from '../src/web/models/databank.js';

const SITE: WebConfig = {
  siteUrl: 'https://koma-ui.vercel.app',
  origin: 'https://koma-ui.vercel.app',
  apiUrl: 'https://koma.duckdns.org',
  socketUrl: 'wss://koma.duckdns.org',
  port: 0,
  clientSecret: 'shh',
};

test('databank page: every item, highest tier first, with its effects at each level and as a masterwork', () => {
  const { maxLevel, items } = databankView();
  assert.equal(maxLevel, REFINE.maxLevel);
  assert.equal(items.length, ITEMS.length);
  for (let i = 1; i < items.length; i++) assert.ok(items[i - 1]!.stars >= items[i]!.stars);

  const withBonus = ITEMS.find((item) => item.bonus)!;
  const plain = ITEMS.find((item) => !item.bonus && !item.usableBy)!;
  const exclusive = ITEMS.find((item) => item.usableBy)!;
  const shown = (id: string) => items.find((item) => item.id === id)!;

  assert.equal(shown(plain.id).effects.length, REFINE.maxLevel);
  assert.deepEqual(shown(plain.id).effects[0], describeEffects(plain, 1, 1, false));
  assert.deepEqual(shown(plain.id).effects.at(-1), describeEffects(plain, 1, REFINE.maxLevel, false));
  assert.equal(shown(plain.id).masterwork, null);
  assert.equal(shown(plain.id).borrowed, null);
  assert.deepEqual(shown(withBonus.id).masterwork, describeEffects(withBonus, 1, REFINE.maxLevel, true));
  assert.ok(shown(exclusive.id).borrowed !== null && shown(exclusive.id).borrowed! < 1);
});

test('databank page: says where each item comes from, and the raid drop chance', () => {
  const { raidDropChance, raidDropChancePerRaider, items } = databankView();
  assert.equal(raidDropChance, CONFIG.raid.dropChance);
  assert.equal(raidDropChancePerRaider, CONFIG.raid.dropChancePerRaider);
  for (const item of ITEMS) assert.equal(items.find((shown) => shown.id === item.id)!.source, item.raidDrop ? 'raid' : 'gacha', item.id);
  assert.ok(items.some((item) => item.source === 'raid') && items.some((item) => item.source === 'gacha'));
});

test('databank page: every raid boss, what it does, and what each difficulty level makes of it', () => {
  const { bosses, raid } = databankView();
  assert.deepEqual(bosses.map((boss) => boss.id), [...RAID_BOSS_IDS]);
  for (const boss of bosses) {
    assert.equal(boss.name, TEXT.raid.bosses[boss.id].name);
    assert.equal(boss.picture, `/api/raid/boss?boss=${boss.id}&mood=calm`);
    assert.deepEqual(boss.hp, { perRaider: CONFIG.raid.hpPerRaider[boss.id], overhead: CONFIG.raid.hpOverhead[boss.id], minRaiders: CONFIG.raid.minRaiders, gear: CONFIG.raid.gearHp[boss.id] });
    assert.ok(boss.moves.length > 0 && boss.phases.length > 0 && boss.rewards.length > 0, boss.id);
    assert.ok(!boss.rewards.includes('raid item'), 'the rewards everyone gets, without the drops (they go by level)');
    assert.ok(boss.rewards.includes('Harder levels pay more'), 'and how the harder levels pay more');
  }
  assert.equal(raid.maxRounds, CONFIG.raid.maxRounds);
  assert.equal(raid.levels.length, RAID_DIFFICULTY.max);
  assert.deepEqual(raid.levels[0], { level: 1, hp: 1, damage: 1, gear: false, wall: 0, drops: [{ stars: 3, count: 1 }] });
  assert.deepEqual(raid.levels.map((level) => level.wall), [0, 0.25, 0.5, 0.75, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(raid.levels.filter((level) => level.drops.some((drop) => drop.stars === 4)).map((level) => level.level), [5, 10]);
  assert.deepEqual(raid.levels.filter((level) => level.gear).map((level) => level.level), [5, 6, 7, 8, 9, 10]);
  assert.equal(raid.levels[2]?.hp, 1 + 2 * CONFIG.raid.difficultyHp);
});

test("databank page: a logged-in member is told how their server's raid stands, and nobody else", async () => {
  const week = { boss: 'reaper' as const, resetsAt: 1_800_000_000_000, status: null, channel: true, maxDifficulty: 4, result: null };
  const server: Server = createServer(
    createApi({
      config: SITE,
      clientId: () => '999',
      guild: (id) => (id === 'g1' ? { name: id, icon: null } : null),
      memberName: async () => 'x',
      balance: async () => 0,
      raid: { start: async () => ({ ok: true }), week: async () => week },
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const session = signSession({ userId: '11', name: 'A', avatar: null, guildIds: ['g1'] }, SITE.clientSecret as string);
  const headers = { Origin: SITE.origin, Authorization: `Bearer ${session}` };
  try {
    const res = await fetch(`${base}/api/raid/week?guild=g1`, { headers });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { boss: 'reaper', maxDifficulty: 4, resetsAt: 1_800_000_000_000 });
    assert.equal((await fetch(`${base}/api/raid/week?guild=g2`, { headers })).status, 403, 'a server they are not in');
    assert.equal((await fetch(`${base}/api/raid/week?guild=g1`, { headers: { Origin: SITE.origin } })).status, 401, 'not logged in');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('databank page: answers the site without a login, and nothing else', async () => {
  const server: Server = createServer(
    createApi({ config: SITE, clientId: () => '999', guild: () => null, memberName: async () => null, balance: async () => 0 }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const res = await fetch(`${base}/api/databank`, { headers: { Origin: SITE.origin } });
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { items: unknown[] }).items.length, ITEMS.length);
    assert.equal((await fetch(`${base}/api/databank`)).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
