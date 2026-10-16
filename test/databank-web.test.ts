import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import { bossEssences, RAID_BOSS_ESSENCES } from '../src/data/transcend.js';
import { raidRewards } from '../src/lib/events/raid.js';
import { RAID_BOSS_IDS, RAID_CLASS_IDS, RAID_CLASSES, RAID_COMBAT, RAID_DIFFICULTY, REFINE, TEXT } from '../src/constants/index.js';
import { ITEMS } from '../src/data/items.js';
import { formatMultiplier, formatPercent } from '../src/lib/format.js';
import { describeEffects } from '../src/lib/game/items/equipment.js';
import { classTraits } from '../src/lib/game/raid-classes.js';
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

test('databank page: every item, highest tier first, with its effects at each level', () => {
  const { maxLevel, items } = databankView();
  assert.equal(maxLevel, REFINE.maxLevel);
  assert.equal(items.length, ITEMS.length);
  for (let i = 1; i < items.length; i++) assert.ok(items[i - 1]!.stars >= items[i]!.stars);

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

test('databank page: says where each item comes from, and the raid drop chance', () => {
  const { raidDropChance, raidDropChancePerRaider, items } = databankView();
  assert.equal(raidDropChance, CONFIG.raid.dropChance);
  assert.equal(raidDropChancePerRaider, CONFIG.raid.dropChancePerRaider);
  const pulled = (item: (typeof ITEMS)[number]) => (item.tmDrop ? 'technomagic' : item.uniqueWeapon !== undefined || item.uniqueTreasure !== undefined ? 'heroBanner' : item.limited ? 'limited' : 'gacha');
  for (const item of ITEMS) assert.equal(items.find((shown) => shown.id === item.id)!.source, item.raidDrop ? 'raid' : pulled(item), item.id);
  // Every place it comes from: a raid item is sold in the raid shop too, and a limited item only comes from its banner.
  for (const item of ITEMS) assert.deepEqual(items.find((shown) => shown.id === item.id)!.sources, item.raidDrop ? ['raid', 'raidShop'] : [pulled(item)], item.id);
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
  assert.ok(cape.effects.every((lines, i) => lines[0]?.startsWith('2 of these') && lines.some((line) => line.startsWith(`Klaus only, as main treasure, ★${i + 1}: [Cut Ground]`))));
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
