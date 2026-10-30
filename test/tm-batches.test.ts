import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { DEFAULTS } from '../src/config.js';
import { findSpec, validateSettings } from '../src/lib/settings-spec.js';
import { replay, STEP_SECONDS, TM_BOSS, type Run } from '../src/lib/game/technomagic.js';
import { BATCH_BETWEEN_MS, batchLoot, batchReport, batchRunMs, batchWhere, TM_BATCH_MOST } from '../src/services/tm-batches.js';
import { LOOT_BOXES, lootBoxOf } from '../src/data/loot-boxes.js';
import { parseReward } from '../src/lib/game/mail.js';
import { fightOut, localFights } from '../src/web/games/technomagic/fight.js';
import { createApi, type ApiDeps } from '../src/web/api.js';
import { signSession } from '../src/web/auth/login.js';
import type { WebConfig } from '../src/web/config.js';
import type { TmBatchesView, TmBatchStore } from '../src/web/models/tm-batches.js';
import type { TmBatchDoc } from '../src/types.js';

const SITE: WebConfig = {
  siteUrl: 'https://koma-ui.vercel.app',
  origin: 'https://koma-ui.vercel.app',
  apiUrl: 'https://koma.duckdns.org',
  socketUrl: 'wss://koma.duckdns.org',
  port: 0,
  clientSecret: 'shh',
};

test('background raids: 100 points a run to start (a Hero setting), up to 200 runs a batch', () => {
  assert.equal(DEFAULTS.hero.backgroundPrice, 100);
  assert.equal(findSpec('hero.backgroundPrice')?.group, 'Hero');
  assert.deepEqual(validateSettings(structuredClone(DEFAULTS)), []);
  assert.equal(TM_BATCH_MOST, 200);
});

test('background raids: a run takes as long as it would played (its fight in real time, and what comes between runs)', () => {
  assert.equal(batchRunMs(0), BATCH_BETWEEN_MS);
  // A minute's fight (at the sim's steps a second), and the time between.
  const minute = Math.round(60 / STEP_SECONDS);
  assert.equal(batchRunMs(minute), 60_000 + BATCH_BETWEEN_MS);
});

test('background raids: a fight is fought out whole on Auto, as a played one with no one pressing anything, the same every time', async () => {
  const run: Run = {
    boss: TM_BOSS,
    seed: 12345,
    stage: 1,
    solo: true,
    heroes: [
      { id: 'kirze', skin: 0, gear: {}, set: null, uw: null, ut: null, artifact: null, skills: [], perks: [] },
      { id: 'klaus', skin: 0, gear: {}, set: null, uw: null, ut: null, artifact: null, skills: [], perks: [] },
      { id: 'laias', skin: 0, gear: {}, set: null, uw: null, ut: null, artifact: null, skills: [], perks: [], sub: true },
    ],
  };
  const fought = fightOut(run);
  assert.ok(typeof fought !== 'string');
  const played = replay(run, []);
  assert.deepEqual(fought, { result: played.result, ticks: played.ticks });
  assert.ok(fought.ticks > 0);
  assert.deepEqual(await localFights.fightOut(run), fought);
  // One that makes no sense: why.
  assert.equal(fightOut({ ...run, boss: 'nobody' }), 'boss');
});

/** A batch over, as its mail says it. */
const batch = (over: Partial<TmBatchDoc> = {}): TmBatchDoc => ({
  _id: 'b1',
  guildId: 'g1',
  userId: 'u1',
  raid: 'technomagic',
  boss: 'galgoria',
  stage: 5,
  heroes: [{ id: 'kirze' }],
  count: 200,
  done: 3,
  won: 2,
  lost: 1,
  spent: 300,
  state: 'done',
  end: 'stopped',
  current: null,
  got: { points: 2000, gems: 0, essences: {}, stones: { warrior: 4 }, crystals: { perseverance: 250 }, items: {}, salvaged: {}, runes: {}, firstClears: 1 },
  startedAt: new Date(0),
  endedAt: new Date(1),
  ...over,
});

test('background raids: their mail says where they fought, how many were won and lost, how long and what they cost, why they ended, and carries their Dispatch Battle Loot', () => {
  assert.equal(batchWhere(batch()), 'Galgoria, stage 5');
  assert.equal(batchWhere(batch({ raid: 'dragon', boss: 'temeraire', mode: 'normal', stage: 7 })), 'Temeraire, Normal 7');
  const boxed = batch({ startedAt: new Date(0), endedAt: new Date(75 * 60_000), got: { points: 0, gems: 5, essences: {}, stones: {}, crystals: {}, items: {}, salvaged: {}, runes: {}, firstClears: 1, boxes: 2 } });
  const report = batchReport(boxed);
  assert.match(report, /^3 raids of 200 fought against Galgoria, stage 5: 2 won, 1 lost \(66\.7% won\)\./);
  assert.match(report, /You stopped them/);
  assert.match(report, /They took 1 h 15 min and cost 300 zeiucoins\./);
  assert.match(report, /1 stage cleared for the first time: 5 komaGems, already yours\./);
  assert.match(report, /Claim all 2, then open them in your Inventory's Others\./);
  assert.doesNotMatch(report, /•/);
  // A box each win, King's Raid's for its boss, mode and stage.
  assert.deepEqual(batchLoot(boxed), [{ kind: 'box', boxId: 'DISPATCH_REWARD_BOX_GARGORIA_RAID_GRADE_5_NEW', count: 2 }]);
  assert.deepEqual(batchLoot(batch({ raid: 'dragon', boss: 'scalaxia', mode: 'normal', stage: 12, got: { ...boxed.got } })), [{ kind: 'box', boxId: 'DISPATCH_REWARD_BOX_RAID_BLUE_T8_2', count: 2 }]);
  assert.deepEqual(batchLoot(batch({ raid: 'dragon', boss: 'armarta', stage: 10, got: { ...boxed.got } })), [{ kind: 'box', boxId: 'DISPATCH_REWARD_BOX_RAID_HARD_BLACK_10', count: 2 }]);
  // A batch from before the boxes: what its wins paid as they ended, and nothing to carry.
  const old = batchReport(batch());
  assert.match(old, /• 2,000 zeiucoins/);
  assert.match(old, /• 4 Technomagic Gear Upgrade Stone \(Warrior\)/);
  assert.match(old, /• 250 Crystal of Galgoria/);
  assert.deepEqual(batchLoot(batch()), []);
  // Nothing won: said so.
  assert.match(batchReport(batch({ won: 0, lost: 3, got: { points: 0, gems: 0, essences: {}, stones: {}, crystals: {}, items: {}, salvaged: {}, runes: {}, firstClears: 0, boxes: 0 } })), /No raid was won, so there is no loot\./);
});

test("loot boxes: King's Raid's Dispatch Battle Loot, one for every stage of every boss and mode, named and pictured as King's Raid has them", () => {
  assert.equal(LOOT_BOXES.length, 2 * 9 + 4 * 30);
  assert.equal(new Set(LOOT_BOXES.map((box) => box.id)).size, LOOT_BOXES.length);
  assert.equal(lootBoxOf('galgoria', 'hard', 9)?.name, 'Galgoria Raid Stage 9 Dispatch Battle Loot');
  assert.equal(lootBoxOf('siegfried', 'hard', 4)?.id, 'DISPATCH_REWARD_BOX_SIEGFRIED_RAID_GRADE_4_NEW');
  assert.equal(lootBoxOf('siegfried', 'hard', 1)?.icon, 'BOX_NONIDENTIFIED_TECHNOMAGIC_SIEGFRIED');
  assert.equal(lootBoxOf('temeraire', 'hard', 3)?.name, 'Fire Dragon Hard Mode Stage 3 Dispatch Battle Loot');
  assert.equal(lootBoxOf('zyrrkinoth', 'normal', 1)?.name, 'Poison Dragon T3 Stage 1 Dispatch Battle Loot');
  assert.equal(lootBoxOf('zyrrkinoth', 'normal', 10)?.id, 'DISPATCH_REWARD_BOX_RAID_GREEN_T7_2');
  assert.equal(lootBoxOf('scalaxia', 'hard', 1)?.icon, 'BOX_DRAGON_ICE');
  assert.equal(lootBoxOf('galgoria', 'hard', 10), undefined);
  // The mail command gives one too.
  assert.deepEqual(parseReward('box:dispatch_reward_box_raid_hard_red_3x4'), { kind: 'box', boxId: 'DISPATCH_REWARD_BOX_RAID_HARD_RED_3', count: 4 });
  assert.equal(parseReward('box:NOPE'), null);
});

test('background raids web: the raid page sees their batch, starts one (what it asks checked) and stops it, with its link or the site’s login', async () => {
  let view: TmBatchesView = { batch: null, price: 100, most: 200, balance: 5000, now: 0 };
  const calls: string[] = [];
  const store: TmBatchStore = {
    view: async () => view,
    start: async (guildId, userId, ask) => {
      calls.push(`start ${guildId} ${userId} ${ask.boss} ${ask.stage} ${ask.count} ${ask.heroes.map((hero) => `${hero.id}${hero.sub ? '*' : ''}`).join(',')}`);
      if (view.batch) return 'running';
      view = { ...view, batch: { id: 'b1', raid: ask.raid, boss: ask.boss, bossName: 'Galgoria', where: 'Galgoria, stage 1', mode: ask.mode, stage: ask.stage, heroes: ask.heroes, count: ask.count, done: 0, won: 0, lost: 0, spent: 0, state: 'running', end: null, current: null, startedAt: 0, endedAt: null } };
      return view;
    },
    stop: async (guildId, userId) => {
      calls.push(`stop ${guildId} ${userId}`);
      if (!view.batch || view.batch.state !== 'running') return 'not_found';
      view = { ...view, batch: { ...view.batch, state: 'done', end: 'stopped' } };
      return view;
    },
  };
  const deps: ApiDeps = {
    config: SITE,
    clientId: () => '999',
    guild: (id) => (id === 'g1' ? { name: id, icon: null } : null),
    memberName: async (guildId, userId) => (guildId === 'g1' && userId === 'u1' ? 'ZEIU' : null),
    balance: async () => 0,
    tmBatches: store,
  };
  const session = signSession({ userId: 'u1', name: 'ZEIU', avatar: null, guildIds: ['g1'] }, 'shh');
  const headers = { Origin: SITE.origin, 'Content-Type': 'application/json', Authorization: `Bearer ${session}` };
  const server: Server = createServer(createApi(deps));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  try {
    const got = await fetch(`${base}/api/tm-batches?guild=g1`, { headers });
    assert.equal(got.status, 200);
    assert.deepEqual(await got.json(), view);

    const ask = { guild: 'g1', raid: 'technomagic', boss: 'galgoria', mode: 'hard', stage: 1, heroes: [{ id: 'kirze' }, { id: 'laias', sub: true }], count: 50 };
    const started = await post('/api/tm-batches/start', ask);
    assert.equal(started.status, 200);
    assert.equal(((await started.json()) as TmBatchesView).batch?.state, 'running');
    // A second at once: one runs at a time.
    const twice = await post('/api/tm-batches/start', ask);
    assert.equal(twice.status, 409);
    assert.deepEqual(await twice.json(), { error: 'running' });
    // What makes no sense isn't asked of the store.
    assert.equal((await post('/api/tm-batches/start', { ...ask, raid: 'weekly' })).status, 400);
    assert.equal((await post('/api/tm-batches/start', { ...ask, count: 1.5 })).status, 400);

    const stopped = await post('/api/tm-batches/stop', { guild: 'g1' });
    assert.equal(((await stopped.json()) as TmBatchesView).batch?.end, 'stopped');
    assert.equal((await post('/api/tm-batches/stop', { guild: 'g1' })).status, 404);
    assert.deepEqual(calls, ['start g1 u1 galgoria 1 50 kirze,laias*', 'start g1 u1 galgoria 1 50 kirze,laias*', 'stop g1 u1', 'stop g1 u1']);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
