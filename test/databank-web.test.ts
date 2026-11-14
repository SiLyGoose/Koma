import assert from 'node:assert/strict';
import { createServer, get, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { CONFIG } from '../src/config.js';
import { bossEssences, RAID_BOSS_ESSENCES } from '../src/data/transcend.js';
import { raidRewards } from '../src/lib/events/raid.js';
import { RAID_BOSS_IDS, RAID_CLASS_IDS, RAID_CLASSES, RAID_COMBAT, RAID_DIFFICULTY, REFINE, TEXT } from '../src/constants/index.js';
import { ITEMS } from '../src/data/items.js';
import { ARTIFACT_TEXT, isTmPiece, KR_ITEMS } from '../src/data/kr-gear.js';
import { TM_SETS_BY_ID } from '../src/data/tm-sets.js';
import { formatMultiplier, formatPercent } from '../src/lib/format.js';
import { describeEffects } from '../src/lib/game/items/equipment.js';
import { classTraits } from '../src/lib/game/raid-classes.js';
import { signSession } from '../src/web/auth/login.js';
import { createApi } from '../src/web/api.js';
import type { WebConfig } from '../src/web/config.js';
import { databankView } from '../src/web/models/databank.js';

/** King's Raid's TechnoMagic pieces and artifacts, which the databank lists after the catalog's items; and how many items it lists in all. */
const TM_PIECES = KR_ITEMS.filter(isTmPiece);
const ARTIFACTS = KR_ITEMS.filter((item) => item.kr?.part === 'artifact');
const SHOWN = ITEMS.length + TM_PIECES.length + ARTIFACTS.length;

const SITE: WebConfig = {
  siteUrl: 'https://koma-ui.vercel.app',
  origin: 'https://koma-ui.vercel.app',
  apiUrl: 'https://koma.duckdns.org',
  socketUrl: 'wss://koma.duckdns.org',
  port: 0,
  clientSecret: 'shh',
};

test('databank page: every item, highest tier first, with its effects at each level', () => {
  const { maxLevel, items } = databankView();
  assert.equal(maxLevel, REFINE.maxLevel);
  assert.equal(items.length, SHOWN);
  for (let i = 1; i < ITEMS.length; i++) assert.ok(items[i - 1]!.stars >= items[i]!.stars);

  const withBonus = ITEMS.find((item) => item.bonus)!;
  const plain = ITEMS.find((item) => !item.bonus && !item.usableBy)!;
  const exclusive = ITEMS.find((item) => item.usableBy)!;
  const shown = (id: string) => items.find((item) => item.id === id)!;

  assert.equal(shown(plain.id).effects.length, REFINE.maxLevel);
  assert.deepEqual(shown(plain.id).effects[0], describeEffects(plain, 1, 1));
  assert.deepEqual(shown(plain.id).effects.at(-1), describeEffects(plain, 1, REFINE.maxLevel));
  assert.equal(shown(plain.id).borrowed, null);
  assert.deepEqual(shown(withBonus.id).effects.at(-1), describeEffects(withBonus, 1, REFINE.maxLevel), 'its R5 bonus included');
  assert.ok(shown(exclusive.id).borrowed !== null && shown(exclusive.id).borrowed! < 1);
});

test("databank page: King's Raid's TechnoMagic pieces after the catalog, in their order, with their icon, class, part and set", () => {
  const { items } = databankView();
  const shown = items.slice(ITEMS.length, ITEMS.length + TM_PIECES.length);
  assert.ok(TM_PIECES.length > 0);
  assert.deepEqual(shown.map((item) => item.id).sort(), TM_PIECES.map((item) => item.id).sort());
  // (Galgoria's set first, then by class.)
  assert.equal(shown[0]?.set?.boss, 'galgoria');
  assert.equal(shown[0]?.class, RAID_CLASS_IDS[0]);
  for (const item of shown) {
    const def = TM_PIECES.find((one) => one.id === item.id)!;
    const set = TM_SETS_BY_ID.get(def.kr!.set as never)!;
    assert.equal(item.source, 'technomagic');
    assert.deepEqual(item.sources, ['technomagic']);
    assert.equal(item.icon, def.kr?.icon);
    assert.equal(item.part, def.kr?.part);
    assert.equal(item.class, def.kr?.classes[0]);
    assert.equal(item.set?.name, set.name, item.id);
    assert.equal(item.set?.boss, set.boss);
    assert.equal(item.set?.effect, set.effects[item.class!] ?? 'nothing for its class');
  }
});

test("databank page: King's Raid's artifacts after its TechnoMagic pieces, A to Z, with their icon and their words at each of their stars", () => {
  const { items } = databankView();
  const shown = items.slice(ITEMS.length + TM_PIECES.length);
  assert.ok(ARTIFACTS.length > 0);
  assert.deepEqual(shown.map((item) => item.id).sort(), ARTIFACTS.map((item) => item.id).sort());
  for (let i = 1; i < shown.length; i++) assert.ok(shown[i - 1]!.name.localeCompare(shown[i]!.name) <= 0);
  for (const item of shown) {
    const def = ARTIFACTS.find((one) => one.id === item.id)!;
    assert.equal(item.part, 'artifact');
    assert.equal(item.icon, def.kr?.icon);
    assert.deepEqual(item.sources, ['technomagic', 'heroBanner']);
    // (★1 to the top: King's Raid's words for that many stars.)
    assert.deepEqual(item.effects, Array.from({ length: REFINE.maxLevel }, (_, i) => [ARTIFACT_TEXT.get(item.id)![i + 1]!]), item.id);
  }
});

test('databank page: says where each item comes from, and the raid drop chance', () => {
  const { raidDropChance, raidDropChancePerRaider, items } = databankView();
  assert.equal(raidDropChance, CONFIG.raid.dropChance);
  assert.equal(raidDropChancePerRaider, CONFIG.raid.dropChancePerRaider);
  const pulled = (item: (typeof ITEMS)[number]) => (item.tmDrop ? 'technomagic' : item.uniqueWeapon !== undefined || item.uniqueTreasure !== undefined ? 'heroBanner' : item.limited ? 'limited' : 'gacha');
  for (const item of ITEMS) assert.equal(items.find((shown) => shown.id === item.id)!.source, item.raidDrop ? 'raid' : pulled(item), item.id);
  // Every place it comes from: a raid item is sold in the raid shop too, and a limited item only comes from its banner.
  for (const item of ITEMS) assert.deepEqual(items.find((shown) => shown.id === item.id)!.sources, item.raidDrop ? ['raid', 'dragon', 'raidShop'] : [pulled(item)], item.id);
  assert.ok(items.some((item) => item.source === 'limited'));
  assert.ok(items.some((item) => item.source === 'technomagic'));
  // A unique weapon comes from the Hero Item banner, says whose it is, and says what it does in the raid at each level.
  const exian = items.find((item) => item.id === 'the-guardian-exian')!;
  assert.equal(exian.source, 'heroBanner');
  assert.equal(exian.uniqueWeapon, 'klaus');
  assert.ok(exian.effects.every((lines, i) => lines.some((line) => line.startsWith(`Klaus only, ★${i + 1}:`))));
  // A unique treasure too: whose it is, which of its four, the options a copy rolls, and what it does as its main treasure at each level.
  const cape = items.find((item) => item.id === 'cape-of-justice')!;
  assert.equal(cape.source, 'heroBanner');
  assert.deepEqual(cape.uniqueTreasure, { hero: 'klaus', skill: 1 });
  assert.ok(cape.effects.every((lines, i) => lines.some((line) => line.startsWith(`Klaus only, as main treasure, ★${i + 1}: [Cut Ground]`))));
  // (Its options, every unique treasure's the same, are sent once: the pool its levels start with.)
  assert.equal(cape.pool, 'ut');
  assert.ok(databankView().pools.ut[0]?.startsWith('2 of these'));
  assert.ok(items.some((item) => item.source === 'raid') && items.some((item) => item.source === 'gacha'));
  // A class item is tagged with its raid class, and the classes are listed for the page's filter.
  for (const item of ITEMS) assert.equal(items.find((shown) => shown.id === item.id)!.class, item.class ?? null, item.id);
  assert.deepEqual(databankView().classes, RAID_CLASS_IDS.map((id) => ({ id, name: TEXT.raid.classes[id].name, traits: classTraits(id) })));
  assert.deepEqual([...new Set(items.filter((item) => item.class !== null).map((item) => item.class))].sort(), [...RAID_CLASS_IDS].sort(), 'at least one item for each class');
});

test('databank page: what each raid class does, a line for each rule that is not a plain raider\'s', () => {
  const traits = Object.fromEntries(databankView().classes.map((cls) => [cls.id, cls.traits]));
  for (const id of RAID_CLASS_IDS) assert.ok(traits[id]!.length > 0, id);
  // Today's numbers, in the lines.
  const has = (id: string, ...words: string[]): void => assert.ok(words.every((word) => traits[id]!.some((line) => line.includes(word))), `${id}: ${traits[id]!.join(' | ')}`);
  const { knight, priest, mechanic, wizard, assassin, archer } = RAID_CLASSES;
  has('knight', '**Attack**', `**${formatMultiplier(knight.attack)}**`, '**Party guard**', `**${formatPercent(knight.partyCut)}**`, formatPercent(RAID_COMBAT.guard.aoeCutMax), '**Cover**');
  has('priest', '**Heal**', `**${formatMultiplier(priest.heal)}**`, '**Critical heals**');
  has('mechanic', '**Long rally**', `${RAID_COMBAT.support.rallyTurns + mechanic.rallyTurns} in all`, `counts as ${mechanic.interrupts}`, '**Ward**');
  has('wizard', '**Hex**', `**${formatPercent(wizard.hex)}**`, '**Mass dispel**');
  has('assassin', `**${formatMultiplier(assassin.attack)}**`, '**HP**', `**${formatMultiplier(assassin.hp)}**`, '**Damage taken**', `**${formatMultiplier(assassin.taken)}**`);
  has('archer', '**Ramp**', `**${formatPercent(archer.rampStep)}**`, `**${formatPercent(archer.rampMax)}**`);
  // Only what differs: an archer attacks as hard as anyone to start with, and nobody but a knight covers.
  assert.ok(!traits.archer!.some((line) => line.includes('**Attack**')));
  for (const id of RAID_CLASS_IDS) assert.equal(traits[id]!.some((line) => line.includes('**Cover**')), id === 'knight', id);
});

test('databank page: every raid boss, what it does, and what each difficulty level makes of it', () => {
  const { bosses, raid } = databankView();
  assert.deepEqual(bosses.map((boss) => boss.id), [...RAID_BOSS_IDS]);
  for (const boss of bosses) {
    assert.equal(boss.name, TEXT.raid.bosses[boss.id].name);
    assert.equal(boss.picture, `/api/raid/boss?boss=${boss.id}&mood=calm`);
    assert.deepEqual(boss.hp, { perRaider: CONFIG.raid.hpPerRaider[boss.id], overhead: CONFIG.raid.hpOverhead[boss.id], minRaiders: CONFIG.raid.minRaiders, gear: CONFIG.raid.gearHp[boss.id] });
    assert.ok(boss.moves.length > 0 && boss.phases.length > 0, boss.id);
    // The rewards at each level, in the levels' order.
    assert.equal(boss.rewards.length, RAID_DIFFICULTY.max, boss.id);
    const { points, tokens, gems, essences } = raidRewards(3, CONFIG.raid);
    assert.deepEqual(boss.rewards[2], { points, tokens, gems, essences: bossEssences(boss.id, essences) }, 'each level says what it pays');
    assert.deepEqual(Object.keys(boss.rewards[0].essences), [...RAID_BOSS_ESSENCES[boss.id]], 'its three kinds of essence');
  }
  assert.equal(raid.maxRounds, CONFIG.raid.maxRounds);
  assert.equal(raid.levels.length, RAID_DIFFICULTY.max);
  // (The Weekly Boss drops raid.weeklyMultiplier times as many.)
  assert.deepEqual(raid.levels[0], { level: 1, hp: 1, damage: 1, gear: false, wall: 0, drops: [{ stars: 3, count: CONFIG.raid.weeklyMultiplier }] });
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

test('the API: a big reply goes compressed to a browser that takes it (brotli, else gzip), a small one as it is', async () => {
  const server: Server = createServer(
    createApi({ config: SITE, clientId: () => '999', guild: () => null, memberName: async () => null, balance: async () => 0 }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  /** The reply's raw bytes (fetch would uncompress them), asking with `encoding` as its Accept-Encoding. */
  const ask = (path: string, encoding?: string) =>
    new Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
      get(`${base}${path}`, { headers: { Origin: SITE.origin, ...(encoding !== undefined && { 'Accept-Encoding': encoding }) } }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      }).on('error', reject);
    });
  const itemsIn = (body: Buffer): number => (JSON.parse(body.toString('utf8')) as { items: unknown[] }).items.length;
  try {
    const br = await ask('/api/databank', 'gzip, deflate, br');
    assert.deepEqual([br.status, br.headers['content-encoding'], br.headers['content-type']], [200, 'br', 'application/json; charset=utf-8']);
    assert.match(String(br.headers.vary), /Accept-Encoding/);
    assert.equal(itemsIn(brotliDecompressSync(br.body)), SHOWN);
    const plain = await ask('/api/databank', 'identity');
    assert.ok(br.body.length * 5 < plain.body.length, 'far smaller');

    // Kept by the browser and asked about again: unchanged, nothing to download.
    assert.deepEqual([br.headers['cache-control'], typeof br.headers.etag], ['no-cache', 'string']);
    const again = await new Promise<{ status: number; length: number }>((resolve, reject) => {
      get(`${base}/api/databank`, { headers: { Origin: SITE.origin, 'Accept-Encoding': 'br', 'If-None-Match': br.headers.etag as string } }, (res) => {
        let length = 0;
        res.on('data', (chunk: Buffer) => (length += chunk.length));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, length }));
      }).on('error', reject);
    });
    assert.deepEqual(again, { status: 304, length: 0 });
    // A setting changed (re-read while the bot runs): made again, under another ETag.
    const before = CONFIG.raid.dropChance;
    CONFIG.raid.dropChance = before === 0.5 ? 0.25 : 0.5;
    try {
      const changed = await ask('/api/databank', 'br');
      assert.notEqual(changed.headers.etag, br.headers.etag);
      assert.equal((JSON.parse(brotliDecompressSync(changed.body).toString('utf8')) as { raidDropChance: number }).raidDropChance, CONFIG.raid.dropChance);
    } finally {
      CONFIG.raid.dropChance = before;
    }

    const gz = await ask('/api/databank', 'gzip;q=1, br;q=0');
    assert.equal(gz.headers['content-encoding'], 'gzip');
    assert.equal(itemsIn(gunzipSync(gz.body)), SHOWN);

    assert.equal(plain.headers['content-encoding'], undefined);
    assert.equal(itemsIn(plain.body), SHOWN);
    // A small reply (not logged in) as it is.
    const small = await ask('/api/me', 'br');
    assert.deepEqual([small.status, small.headers['content-encoding'], JSON.parse(small.body.toString('utf8'))], [401, undefined, { error: 'not_logged_in' }]);
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
    assert.equal(((await res.json()) as { items: unknown[] }).items.length, SHOWN);
    assert.equal((await fetch(`${base}/api/databank`)).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
