import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RaidWeekInfo, WebRaidStart } from '../src/commands/raid.js';
import { createRaid, type RaidAction, type RaidChoice } from '../src/lib/events/raid.js';
import { clearLiveRaids, openLiveRaid, type ActAnswer, type LobbyAnswer } from '../src/lib/events/raid-live.js';
import { resetLive } from '../src/web/live.js';
import { bossPicture } from '../src/web/raid/picture.js';
import { parseClientMessage, type RaidView, type ServerMessage } from '../src/web/raid/protocol.js';
import { openConnection, type RaidSiteDeps } from '../src/web/raid/server.js';
import { raidView } from '../src/web/raid/view.js';
import { signToken } from '../src/web/token.js';

const week = (over: Partial<RaidWeekInfo> = {}): RaidWeekInfo => ({ boss: 'wyrm', resetsAt: Date.now() + 86_400_000, status: null, channel: true, ...over });
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
function openTestLobby(host = 'u1') {
  const names = new Map([[host, `Name ${host}`]]);
  const live = openLiveRaid('g1', 'wyrm', host, names);
  const players = [host];
  let started = false;
  live.openLobby({
    players,
    closesAt: Date.now() + 60_000,
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

test('idle: how the week stands, and whether the page can start the raid', () => {
  clearLiveRaids();
  const open = raidView('u1', week(), null);
  assert.equal(open.phase, 'idle');
  assert.deepEqual(open.idle, { week: 'open', canStart: true });
  assert.equal(open.boss.name, 'Ember Wyrm');
  assert.equal(open.picture, '/api/raid/boss?boss=wyrm&mood=calm');

  assert.deepEqual(raidView('u1', week({ channel: false }), null).idle, { week: 'open', canStart: false });
  const won = raidView('u1', week({ status: 'won' }), null);
  assert.deepEqual(won.idle, { week: 'won', canStart: false });
  assert.equal(won.mood, 'defeated');
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
  const over = raidView('u1', week({ status: 'won' }), live);
  assert.equal(over.phase, 'over');
  assert.equal(over.over?.end, 'won');
  assert.deepEqual(over.over?.ranking, [{ userId: 'u1', damage: 500 }]);
  assert.deepEqual(over.over?.players, [{ userId: 'u1', damage: 500, healed: 0, mitigated: 0 }]);
  assert.ok(over.over?.reward);
  assert.equal(over.mood, 'defeated');
  const later = raidView('u1', week({ status: 'won' }), live, Date.now() + 31 * 60_000);
  assert.equal(later.phase, 'idle');
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
