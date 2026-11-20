import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LASER_WEB, POTATO_WEB } from '../src/constants/index.js';
import { laserGames, type LaserGame } from '../src/events/games/laser-grid.js';
import { potatoGames, type PotatoGame } from '../src/events/games/hot-potato.js';
import { WATCHABLE } from '../src/protocol/site.js';
import { signToken, signWatchToken } from '../src/web/auth/token.js';
import { GAMES } from '../src/web/config.js';
import { parseClientMessage as parseLaser } from '../src/web/games/laser/protocol.js';
import { laserState } from '../src/web/games/laser/server.js';
import { resetLive } from '../src/web/games/live.js';
import { REACTIONS } from '../src/protocol/reactions.js';
import { parseClientMessage as parsePotato, type ServerMessage } from '../src/web/games/potato/protocol.js';
import { openPotatoConnection } from '../src/web/games/potato/server.js';

type Got = ServerMessage | { t: string; [key: string]: unknown };

function fakePeer() {
  const peer = {
    got: [] as Got[],
    send: (message: Got) => void peer.got.push(message),
    close: () => {},
    of: <T extends string>(t: T) => peer.got.filter((m) => m.t === t),
    lastState: () => {
      const found = [...peer.got].reverse().find((m) => m.t === 'state') as Extract<ServerMessage, { t: 'state' }> | undefined;
      assert.ok(found, 'the page was sent the game');
      return found.state;
    },
  };
  return peer;
}

/** A Hot Potato going on that `players` joined, holding a potato; it records the passes asked of it. */
function fakePotato(players: string[]): PotatoGame & { passes: string[] } {
  const passes: string[] = [];
  return {
    passes,
    live: () => ({
      phase: 'potato',
      prize: 1000,
      fine: 100,
      joinEndsAt: 1,
      blasts: 2,
      blast: 1,
      players: players.map((id) => ({ id, name: id, out: false, blastedBy: 0, passes: 0 })),
      holder: players[0] ?? null,
      blown: null,
      vault: 800,
      servedAt: 1,
      trail: [],
    }),
    plays: (userId) => players.includes(userId),
    join: () => 'closed',
    pass(userId, to) {
      passes.push(to ? `${userId}>${to}` : userId);
      return { result: 'passed', to: 'u2', name: 'Bo' };
    },
  };
}

async function hello(userId: string) {
  const page = fakePeer();
  const connection = openPotatoConnection(page);
  await connection.receive(JSON.stringify({ t: 'hello', token: signToken({ guildId: 'g1', userId, name: userId }, 60_000) }));
  return { page, connection };
}

test('the two vault events are site games with their own sockets, and can be watched', () => {
  assert.deepEqual(GAMES.potato, { page: '/games/potato', socket: POTATO_WEB.path });
  assert.deepEqual(GAMES.laser, { page: '/games/laser', socket: LASER_WEB.path });
  assert.ok((WATCHABLE as readonly string[]).includes('potato'));
  assert.ok((WATCHABLE as readonly string[]).includes('laser'));
});

test('their pages: what they may say, and nothing else', () => {
  assert.deepEqual(parsePotato('{"t":"pass"}'), { t: 'pass' });
  assert.deepEqual(parsePotato('{"t":"pass","to":"123"}'), { t: 'pass', to: '123' }, 'the holder passing to someone picked');
  assert.equal(parsePotato('{"t":"pass","to":5}'), null);
  assert.equal(parsePotato(`{"t":"pass","to":"${'1'.repeat(33)}"}`), null);
  assert.deepEqual(parsePotato('{"t":"react","emoji":0}'), { t: 'react', emoji: 0 });
  assert.deepEqual(parseLaser(`{"t":"react","emoji":${REACTIONS.length - 1}}`), { t: 'react', emoji: REACTIONS.length - 1 });
  assert.equal(parsePotato(`{"t":"react","emoji":${REACTIONS.length}}`), null, 'only the reactions there are');
  assert.equal(parseLaser('{"t":"react","emoji":"x"}'), null);
  assert.deepEqual(parsePotato('{"t":"join"}'), { t: 'join' });
  assert.equal(parsePotato('{"t":"chat","text":"hi"}'), null, 'no chat beside the events');
  assert.equal(parseLaser('{"t":"chat","text":"hi"}'), null);
  assert.equal(parsePotato('{"t":"press","round":1,"phase":"go","slot":0}'), null, 'Laser Grid has presses, not Hot Potato');
  assert.equal(parsePotato('not json'), null);
  assert.deepEqual(parseLaser('{"t":"press","round":3,"phase":"go","slot":2}'), { t: 'press', round: 3, phase: 'go', slot: 2 });
  assert.equal(parseLaser('{"t":"press","round":3,"phase":"fire","slot":2}'), null);
  assert.equal(parseLaser('{"t":"press","round":-1,"phase":"go","slot":2}'), null);
  assert.equal(parseLaser('{"t":"press","round":1,"phase":"go","slot":1.5}'), null);
  assert.equal(parseLaser('{"t":"pass"}'), null);
});

test('hot potato page: a player plays, a late page watches, and both are told the one game whenever it changes', async () => {
  resetLive();
  const game = fakePotato(['u1', 'u2']);
  potatoGames.opened('g1', game);
  try {
    const player = await hello('u1');
    const late = await hello('u9');
    assert.equal(player.page.lastState().playing, true);
    assert.equal(late.page.lastState().playing, false, "didn't join in time: watches");
    assert.equal(late.page.lastState().live?.holder, 'u1', 'but sees the same game');
    assert.equal(player.page.of('chats').length, 0, 'no chat beside it');

    await player.connection.receive('{"t":"pass"}');
    await player.connection.receive('{"t":"pass","to":"u2"}');
    assert.deepEqual(game.passes, ['u1', 'u1>u2'], 'a pass, and one to the player picked');
    assert.deepEqual(player.page.got.at(-1), { t: 'answer', to: 'pass', result: 'passed', name: 'Bo' });
    assert.ok(player.page.lastState().avatars.u2?.startsWith('https://'), "each player's picture (Discord's default, the bot not knowing theirs)");

    const before = late.page.of('state').length;
    potatoGames.changed('g1');
    assert.equal(late.page.of('state').length, before + 1);

    potatoGames.closed('g1', { kind: 'done', prize: 1000, winners: [{ id: 'u2', name: 'Bo', won: 1000 }], out: [], trail: [], endedAt: 1 });
    assert.equal(player.page.lastState().live, null);
    assert.equal(player.page.lastState().last?.winners[0]?.name, 'Bo');
    player.connection.closed();
    late.connection.closed();
  } finally {
    potatoGames.closed('g1', null);
  }
});

test("hot potato watching: a watch link sees the player's view, and only its reactions are taken (there's no chat)", async () => {
  resetLive();
  const game = fakePotato(['u1']);
  potatoGames.opened('g1', game);
  try {
    const player = await hello('u1');
    const watcherPage = fakePeer();
    const watcher = openPotatoConnection(watcherPage);
    await watcher.receive(JSON.stringify({ t: 'watch', token: signWatchToken({ viewer: { guildId: 'g1', userId: 'w1', name: 'Wes' }, targetId: 'u1' }, 60_000) }));
    assert.equal(watcherPage.of('watching').length, 1);
    assert.equal(watcherPage.lastState().you, 'u1', "a watcher sees the player's view");
    assert.equal(watcherPage.of('chats').length, 0);

    await watcher.receive('{"t":"pass"}');
    assert.deepEqual(game.passes, [], "a watcher's pass isn't taken");
    await watcher.receive('{"t":"react","emoji":1}');
    assert.deepEqual(player.page.of('reaction'), [{ t: 'reaction', id: 'w1', name: 'Wes', emoji: 1, spectator: true }], "a watcher's reaction reaches the game's pages");
    assert.equal(watcherPage.of('reaction').length, 1, 'and its own, through the page it watches');
    await player.connection.receive('{"t":"chat","text":"mine!"}');
    assert.equal(player.page.got.at(-1)?.t, 'error', 'chat is a message the page can no longer say');
    watcher.closed();
    player.connection.closed();
  } finally {
    potatoGames.closed('g1', null);
  }
});

test('reactions: every page in the server is told, a player at most one every REACTION_GAP_MS', async () => {
  resetLive();
  potatoGames.opened('g1', fakePotato(['u1']));
  try {
    const a = await hello('u1');
    const b = await hello('u9');
    await a.connection.receive('{"t":"react","emoji":2}');
    await a.connection.receive('{"t":"react","emoji":3}');
    assert.deepEqual(b.page.of('reaction'), [{ t: 'reaction', id: 'u1', name: 'u1', emoji: 2 }], 'the second came too soon');
    assert.equal(a.page.of('reaction').length, 1, "the page's own too");
    assert.equal(a.page.of('answer').length, 0, 'a reaction is not answered');
    a.connection.closed();
    b.connection.closed();
  } finally {
    potatoGames.closed('g1', null);
  }
});

test('laser grid page: playing or watching, and how the last one ended', () => {
  const game: LaserGame = {
    live: () => ({
      phase: 'ready',
      prize: 1,
      bonusPerPlayer: 0,
      fine: 100,
      joinEndsAt: 1,
      rounds: 8,
      round: 1,
      windowMs: 3000,
      slots: 5,
      duckSlot: null,
      decoys: [],
      deadline: null,
      players: [{ id: 'u1', name: 'Al', caughtRound: 0, caughtFor: null, bestMs: 300, totalMs: 700, now: { result: 'ducked', ms: 300 } }],
      fastest: null,
      vault: 1,
    }),
    plays: (userId) => userId === 'u1',
    join: () => 'closed',
    press: () => ({ result: 'closed' }),
  };
  laserGames.opened('g2', game);
  try {
    assert.equal(laserState('g2', 'u1').playing, true);
    assert.equal(laserState('g2', 'u2').playing, false);
    assert.equal(laserState('g2', 'u2').live?.duckSlot, null);
    assert.deepEqual(Object.keys(laserState('g2', 'u2').avatars), ['u1'], "the players' pictures");
  } finally {
    laserGames.closed('g2', { kind: 'nobody', prize: 1, lastRound: 0, winners: [], caught: [], endedAt: 1 });
  }
  assert.equal(laserState('g2', 'u1').live, null);
  assert.equal(laserState('g2', 'u1').last?.kind, 'nobody');
});
