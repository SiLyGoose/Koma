import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import { ITEMS_BY_ID } from '../src/data/items.js';
import type { ItemDef } from '../src/types.js';
import type { RaidWeekInfo, WebRaidStart } from '../src/commands/raid.js';
import { createRaid, type RaidAction, type RaidChoice } from '../src/lib/events/raid.js';
import { clearLiveRaids, openLiveRaid, type ActAnswer, type LobbyAnswer } from '../src/lib/events/raid-live.js';
import { resetLive } from '../src/web/games/live.js';
import { bossPicture } from '../src/web/games/raid/picture.js';
import { parseClientMessage, type RaidView, type ServerMessage } from '../src/web/games/raid/protocol.js';
import { openConnection, type RaidSiteDeps } from '../src/web/games/raid/server.js';
import { raidView } from '../src/web/games/raid/view.js';
import { signToken } from '../src/web/auth/token.js';

const week = (over: Partial<RaidWeekInfo> = {}): RaidWeekInfo => ({ boss: 'wyrm', resetsAt: Date.now() + 86_400_000, status: null, channel: true, maxDifficulty: 1, ...over });
const wait = (ms = 150): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function fakePage() {
  const sent: ServerMessage[] = [];
  return { sent, closed: false, send: (m: ServerMessage) => void sent.push(m), close() { this.closed = true; } };
}

async function connect(userId: string, deps: Partial<RaidSiteDeps> = {}) {
  const page = fakePage();
  const full: RaidSiteDeps = { start: async () => ({ ok: true }), week: async () => week(), ...deps };
  const connection = openConnection(page, full);
  await connection.receive(JSON.stringify({ t: 'hello', token: signToken({ guildId: 'g1', userId, name: `Name ${userId}` }, 60_000) }));
  const say = (m: object) => connection.receive(JSON.stringify(m));
  const views = () => page.sent.filter((m): m is Extract<ServerMessage, { t: 'raid' }> => m.t === 'raid').map((m) => m.view);
  const last = (): RaidView => views().at(-1) as RaidView;
  const answers = () => page.sent.filter((m) => m.t === 'answer');
  return { page, connection, say, views, last, answers };
}

/** A lobby in the registry that works like the real one (commands/raid.ts). */
function openTestLobby(host = 'u1', maxDifficulty = 1) {
  const names = new Map([[host, `Name ${host}`]]);
  const live = openLiveRaid('g1', 'wyrm', host, names);
  const players = [host];
  let started = false;
  let difficulty = 1;
  live.openLobby({
    players,
    disband(userId): LobbyAnswer {
      if (players[0] !== userId) return 'only_host';
      live.end({ end: 'disbanded', state: null, rewarded: false });
      return 'disbanded';
    },
    get difficulty() {
      return difficulty;
    },
    maxDifficulty,
    setDifficulty(userId, level): LobbyAnswer {
      if (players[0] !== userId) return 'only_host';
      if (!Number.isInteger(level) || level < 1 || level > maxDifficulty) return 'locked';
      difficulty = level;
      live.difficulty = level;
      live.changed();
      return 'difficulty_set';
    },
    join(userId, name): LobbyAnswer {
      if (players.includes(userId)) return 'already_joined';
      players.push(userId);
      names.set(userId, name);
      live.changed();
      return 'joined';
    },
    leave(userId): LobbyAnswer {
      const at = players.indexOf(userId);
      if (at === -1) return 'not_joined';
      players.splice(at, 1);
      live.changed();
      return 'left';
    },
    start(userId): LobbyAnswer {
      if (players[0] !== userId) return 'only_host';
      started = true;
      return 'started';
    },
  });
  return { live, players, names, started: () => started };
}

test("idle: this week's boss, and whether the page can start a raid", () => {
  clearLiveRaids();
  const open = raidView('u1', week(), null);
  assert.equal(open.phase, 'idle');
  assert.equal(open.idle?.week, 'open');
  assert.equal(open.idle?.canStart, true);
  assert.equal(open.boss.name, 'Wyvern');
  assert.equal(open.picture, '/api/raid/boss?boss=wyrm&mood=calm');

  // What the boss does, for the page: its phases, moves and rewards.
  assert.ok(open.brief.moves.length > 0 && open.brief.phases.length > 0 && open.brief.rewards.length > 0);
  // And the raid drops' chances, for the party's buff effects.
  assert.deepEqual(open.drops, { chance: CONFIG.raid.dropChance, perRaider: CONFIG.raid.dropChancePerRaider });

  assert.deepEqual(raidView('u1', week({ channel: false }), null).idle, { week: 'open', canStart: false });
  // A raid starting in Discord that this bot's live raid doesn't have yet.
  assert.deepEqual(raidView('u1', week({ status: 'fighting' }), null).idle, { week: 'busy', canStart: false });
});

test('the page is sent the raid on hello, and starting it goes through the bot', async () => {
  clearLiveRaids();
  resetLive();
  const starts: string[] = [];
  const c = await connect('u1', { start: async (_g, userId): Promise<WebRaidStart> => (starts.push(userId), { ok: false, reason: 'no_channel' }) });
  assert.equal(c.last().phase, 'idle');
  await c.say({ t: 'start' });
  assert.deepEqual(starts, ['u1']);
  assert.deepEqual(c.answers().at(-1), { t: 'answer', to: 'start', code: 'no_channel' });

  // With a raid already going on, a start is turned down without asking.
  openTestLobby('u2');
  await c.say({ t: 'start' });
  assert.deepEqual(starts, ['u1']);
  assert.deepEqual(c.answers().at(-1), { t: 'answer', to: 'start', code: 'started' });
  c.connection.closed();
});

test('joining, leaving and starting the lobby from the page, seen by everyone following it', async () => {
  clearLiveRaids();
  resetLive();
  const lobby = openTestLobby('u1');
  const host = await connect('u1');
  const guest = await connect('u2');
  assert.equal(guest.last().phase, 'lobby');
  assert.deepEqual(guest.last().lobby?.players, ['u1']);

  await guest.say({ t: 'join' });
  assert.deepEqual(guest.answers().at(-1), { t: 'answer', to: 'join', code: 'ok' });
  assert.deepEqual(lobby.players, ['u1', 'u2']);
  assert.equal(lobby.names.get('u2'), 'Name u2');
  await guest.say({ t: 'join' });
  assert.deepEqual(guest.answers().at(-1), { t: 'answer', to: 'join', code: 'already_joined' });

  // The host's page hears about it (batched).
  await wait();
  assert.deepEqual(host.last().lobby?.players, ['u1', 'u2']);
  assert.equal(host.last().names.u2, 'Name u2');

  await guest.say({ t: 'begin' });
  assert.deepEqual(guest.answers().at(-1), { t: 'answer', to: 'begin', code: 'only_host' });
  await host.say({ t: 'begin' });
  assert.deepEqual(host.answers().at(-1), { t: 'answer', to: 'begin', code: 'ok' });
  assert.equal(lobby.started(), true);

  await guest.say({ t: 'leave' });
  assert.deepEqual(lobby.players, ['u1']);
  host.connection.closed();
  guest.connection.closed();
});

test('acting in the fight from the page', async () => {
  clearLiveRaids();
  resetLive();
  const { live } = openTestLobby('u1');
  const state = createRaid('wyrm', ['u1', 'u2'], 1_000, 100, 10);
  const choices = new Map<string, RaidChoice>();
  const acted: [string, RaidAction, string | undefined][] = [];
  live.openFight({
    state,
    log: ['**Round 1**'],
    turn: () => ({ round: state.round, open: true, endsAt: Date.now() + 30_000, choices }),
    act(userId, action, target): ActAnswer {
      acted.push([userId, action, target]);
      if (choices.has(userId)) return { kind: 'already', action: choices.get(userId)!.action };
      choices.set(userId, { action, boost: 0 });
      live.changed();
      return { kind: 'ok' };
    },
  });
  const c = await connect('u1');
  const fight = c.last().fight!;
  assert.equal(c.last().phase, 'fight');
  assert.equal(fight.bossHp, 1_000);
  assert.deepEqual(fight.log, ['**Round 1**']);
  assert.deepEqual(fight.problems, { attack: null, guard: null, heal: null, support: null });
  assert.equal(fight.players.length, 2);

  await c.say({ t: 'act', action: 'heal', target: '123' });
  assert.deepEqual(acted, [['u1', 'heal', '123']]);
  assert.deepEqual(c.answers().at(-1), { t: 'answer', to: 'act', code: 'ok' });
  await c.say({ t: 'act', action: 'attack' });
  assert.deepEqual(c.answers().at(-1), { t: 'answer', to: 'act', code: 'already' });
  await wait();
  assert.equal(c.last().fight?.players.find((p) => p.userId === 'u1')?.picked, 'heal');

  // Someone not in the fight can look, but can't act.
  const outsider = await connect('u9');
  assert.equal(outsider.last().fight?.problems.attack, 'not_playing');
  c.connection.closed();
  outsider.connection.closed();
});

test('a raid that ended is shown for a while, then the week again', () => {
  clearLiveRaids();
  const { live } = openTestLobby('u1');
  const state = createRaid('wyrm', ['u1'], 500, 100, 10);
  state.players[0]!.stats.damage = 500;
  state.bossHp = 0;
  state.outcome = 'won';
  live.end({ end: 'won', state, rewarded: true });
  const over = raidView('u1', week(), live);
  assert.equal(over.phase, 'over');
  assert.equal(over.over?.end, 'won');
  assert.deepEqual(over.over?.ranking, [{ userId: 'u1', damage: 500 }]);
  assert.deepEqual(over.over?.players, [{ userId: 'u1', damage: 500, healed: 0, mitigated: 0, healedSelf: 0, healedAllies: 0, supportDamage: 0, damageTaken: 0 }]);
  assert.ok(over.over?.reward);
  assert.equal(over.mood, 'defeated');
  const later = raidView('u1', week(), live, Date.now() + 6 * 60_000);
  assert.equal(later.phase, 'idle');
});

test("a lobby that never came to a fight shows the week again (to start again), with how it went", () => {
  clearLiveRaids();
  const { live } = openTestLobby('u1');
  live.end({ end: 'no_players', state: null, rewarded: false });
  const v = raidView('u1', week(), live);
  assert.equal(v.phase, 'idle');
  assert.equal(v.idle?.canStart, true);
  assert.equal(v.idle?.last, 'no_players');
  assert.equal(v.over, null);
  assert.ok(v.brief.moves.length > 0);
  // Long after, just the week.
  const after = raidView('u1', week(), live, Date.now() + 31 * 60_000).idle;
  assert.equal(after?.canStart, true);
  assert.equal(after?.last, undefined);
});

test('parsing what a page says', () => {
  assert.deepEqual(parseClientMessage('{"t":"act","action":"guard"}'), { t: 'act', action: 'guard' });
  assert.deepEqual(parseClientMessage('{"t":"act","action":"heal","target":"42"}'), { t: 'act', action: 'heal', target: '42' });
  assert.equal(parseClientMessage('{"t":"act","action":"dance"}'), null);
  assert.equal(parseClientMessage('{"t":"act","action":"heal","target":"<@1>"}'), null);
  assert.equal(parseClientMessage('{"t":"watch","token":"x"}'), null);
  assert.equal(parseClientMessage('nope'), null);
});

test('the boss pictures the page shows', () => {
  const png = bossPicture('wyrm', 'furious');
  assert.ok(png && png.subarray(1, 4).toString() === 'PNG');
  assert.ok(bossPicture('reaper', 'calm'));
  for (const mood of ['calm', 'enraged', 'furious', 'shielded', 'defeated', 'gloating', 'fled']) assert.ok(bossPicture('plague', mood)?.subarray(1, 4).toString() === 'PNG', mood);
  assert.equal(bossPicture('wyrm', 'sleepy'), null);
  assert.equal(bossPicture('../etc', 'calm'), null);
});

test("the raid's players come with their profile pictures, when the bot knows them", async () => {
  clearLiveRaids();
  resetLive();
  const lobby = openTestLobby('u1');
  lobby.live.lobby?.join('u2', 'Name u2');
  const c = await connect('u1', { avatar: (_g, userId) => (userId === 'u1' ? 'https://cdn.example/u1.png' : null) });
  assert.deepEqual(c.last().avatars, { u1: 'https://cdn.example/u1.png' });
  assert.deepEqual(raidView('u1', week(), null).avatars, {});
  c.connection.closed();
});

test("the end screen: the rewards with the currencies' emojis, and whether the raiders' gear was kept", () => {
  clearLiveRaids();
  const { live } = openTestLobby('u1');
  const state = createRaid('wyrm', ['u1'], 500, 100, 10);
  state.bossHp = 0;
  state.outcome = 'won';
  live.gear.set('u1', { equipped: {} });
  live.end({ end: 'won', state, rewarded: true });
  const over = raidView('u1', week(), live).over!;
  assert.match(over.rewardText ?? '', /<:zeiucoin:\d+>/);
  assert.equal(over.gear, true);
});

test("the lobby's difficulty: the host picks it, as far as the server has unlocked, and the boss and drops follow", async () => {
  clearLiveRaids();
  resetLive();
  openTestLobby('u1', 3);
  const host = await connect('u1');
  const other = await connect('u2');
  const first = host.last();
  assert.equal(first.difficulty, 1);
  assert.equal(first.lobby?.difficulty, 1);
  assert.equal(first.lobby?.maxDifficulty, 3);
  assert.equal(first.lobby?.topDifficulty, 10);
  assert.equal(first.lobby?.levels.length, 10);
  assert.deepEqual(first.lobby?.levels[0], { level: 1, hp: 1, damage: 1, gear: false, wall: 0, drops: [{ stars: 3, count: CONFIG.raid.weeklyMultiplier }] });
  assert.deepEqual(first.lobby?.levels.map((level) => level.wall), [0, 0.25, 0.5, 0.75, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(first.lobby?.levels.map((level) => level.gear), [false, false, false, false, true, true, true, true, true, true]);
  assert.equal(first.lobby?.gearHp, CONFIG.raid.gearHp.wyrm);
  assert.deepEqual(first.lobby?.levels[4]?.drops, [{ stars: 4, count: CONFIG.raid.weeklyMultiplier }, { stars: 3, count: 4 * CONFIG.raid.weeklyMultiplier }]);
  assert.deepEqual(first.lobby?.levels[5]?.drops, [{ stars: 3, count: 5 * CONFIG.raid.weeklyMultiplier }], 'only the milestone levels drop 4-stars');

  await other.say({ t: 'difficulty', level: 2 });
  assert.deepEqual(other.answers().at(-1), { t: 'answer', to: 'difficulty', code: 'only_host' });
  await host.say({ t: 'difficulty', level: 4 });
  assert.deepEqual(host.answers().at(-1), { t: 'answer', to: 'difficulty', code: 'locked' });
  await host.say({ t: 'difficulty', level: 3 });
  assert.deepEqual(host.answers().at(-1), { t: 'answer', to: 'difficulty', code: 'ok' });
  await wait();
  const picked = other.last();
  assert.equal(picked.difficulty, 3);
  assert.equal(picked.lobby?.difficulty, 3);
  // Level 3: its share of the HP, and half of the boss's gear HP for every raider (a lobby of 2 counts as the fewest).
  const third = (first.lobby?.bossHp ?? 0) * (1 + 2 * CONFIG.raid.difficultyHp) + 0.5 * CONFIG.raid.gearHp.wyrm * CONFIG.raid.minRaiders;
  assert.ok(Math.abs((picked.lobby?.bossHp ?? 0) - third) <= 1, String(picked.lobby?.bossHp));
  assert.match(picked.brief.rewards, /everyone finds 15× T3 raid items/);

  assert.equal(parseClientMessage(JSON.stringify({ t: 'difficulty', level: 2.5 })), null);
  assert.equal(parseClientMessage(JSON.stringify({ t: 'difficulty' })), null);
  host.connection.closed();
  other.connection.closed();
});

test('before the lobby: whoever starts the raid from the page picks its difficulty, as far as the server has unlocked', async () => {
  clearLiveRaids();
  resetLive();
  // What there is to pick from comes with the week, while the page can start it.
  const pick = raidView('u1', week({ maxDifficulty: 3 }), null).idle?.pick;
  assert.equal(pick?.maxDifficulty, 3);
  assert.equal(pick?.topDifficulty, 10);
  assert.equal(pick?.levels.length, 10);
  assert.deepEqual(pick?.levels[0], { level: 1, hp: 1, damage: 1, gear: false, wall: 0, drops: [{ stars: 3, count: CONFIG.raid.weeklyMultiplier }] });
  assert.equal(pick?.levels[4]?.gear, true);
  assert.equal(pick?.gearHp, CONFIG.raid.gearHp.wyrm);
  assert.equal(raidView('u1', week({ channel: false, maxDifficulty: 3 }), null).idle?.pick, undefined, 'a server the page cannot start it in');
  assert.equal(raidView('u1', week({ status: 'fighting', maxDifficulty: 3 }), null).idle?.pick, undefined, 'a raid starting in Discord');

  // The level picked goes with the start (1 when the page sends none).
  const starts: number[] = [];
  const c = await connect('u1', { start: async (_g, _u, level): Promise<WebRaidStart> => (starts.push(level), { ok: true }), week: async () => week({ maxDifficulty: 3 }) });
  assert.equal(c.last().idle?.pick?.maxDifficulty, 3);
  await c.say({ t: 'start', level: 3 });
  await c.say({ t: 'start' });
  assert.deepEqual(starts, [3, 1]);
  assert.deepEqual(parseClientMessage(JSON.stringify({ t: 'start', level: 2 })), { t: 'start', level: 2 });
  assert.deepEqual(parseClientMessage(JSON.stringify({ t: 'start' })), { t: 'start' });
  assert.equal(parseClientMessage(JSON.stringify({ t: 'start', level: 0 })), null);
  assert.equal(parseClientMessage(JSON.stringify({ t: 'start', level: 'hard' })), null);
  c.connection.closed();
});

test('the end screen: each raider is sent their own raid items, best first', () => {
  clearLiveRaids();
  const { live } = openTestLobby('u1');
  const state = createRaid('wyrm', ['u1', 'u2'], 500, 100, 10);
  state.bossHp = 0;
  state.outcome = 'won';
  const tooth = ITEMS_BY_ID.get('wyvern-tooth') as ItemDef;
  const fang = ITEMS_BY_ID.get('godslayer-fang') as ItemDef;
  const drops = [
    { userId: 'u1', item: tooth, isNew: false },
    { userId: 'u1', item: fang, isNew: true },
    { userId: 'u2', item: tooth, isNew: true },
  ];
  live.end({ end: 'won', state, rewarded: true, loot: { key: 'g1:week:1', drops } });
  assert.deepEqual(raidView('u1', week(), live).over?.loot, {
    key: 'g1:week:1',
    items: [
      { itemId: 'godslayer-fang', name: 'Godslayer Fang', stars: 4, slot: 'weapon', isNew: true },
      { itemId: 'wyvern-tooth', name: 'Wyvern Tooth', stars: 3, slot: 'weapon', isNew: false },
    ],
  });
  assert.equal(raidView('u2', week(), live).over?.loot?.items.length, 1);
  assert.equal(raidView('u9', week(), live).over?.loot, null, 'someone who found nothing');
});

test('the lobby has no countdown, and its host can disband it: the week is shown again, to start again', async () => {
  clearLiveRaids();
  resetLive();
  openTestLobby('u1');
  const host = await connect('u1');
  const other = await connect('u2');
  assert.equal(host.last().phase, 'lobby');
  assert.ok(!('closesAt' in (host.last().lobby ?? {})), 'no time it starts by itself');

  await other.say({ t: 'disband' });
  assert.deepEqual(other.answers().at(-1), { t: 'answer', to: 'disband', code: 'only_host' });
  assert.equal(host.last().phase, 'lobby');
  await host.say({ t: 'disband' });
  assert.deepEqual(host.answers().at(-1), { t: 'answer', to: 'disband', code: 'ok' });
  await wait();
  for (const page of [host, other]) {
    assert.equal(page.last().phase, 'idle');
    assert.equal(page.last().idle?.last, 'disbanded');
    assert.equal(page.last().idle?.canStart, true);
  }
  // Nothing left to disband.
  await host.say({ t: 'disband' });
  assert.deepEqual(host.answers().at(-1), { t: 'answer', to: 'disband', code: 'no_raid' });
  assert.deepEqual(parseClientMessage(JSON.stringify({ t: 'disband' })), { t: 'disband' });
  host.connection.closed();
  other.connection.closed();
});
