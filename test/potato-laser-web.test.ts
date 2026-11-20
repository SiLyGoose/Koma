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
    live: () => ({ phase: 'potato', prize: 1000, fine: 100, joinEndsAt: 1, blasts: 2, blast: 1, players: players.map((id) => ({ id, name: id, out: false, blastedBy: 0, passes: 0 })), holder: players[0] ?? null, blown: null }),
    plays: (userId) => players.includes(userId),
    join: () => 'closed',
    pass(userId) {
      passes.push(userId);
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
    assert.deepEqual(game.passes, ['u1']);
    assert.deepEqual(player.page.got.at(-1), { t: 'answer', to: 'pass', result: 'passed', name: 'Bo' });

    const before = late.page.of('state').length;
    potatoGames.changed('g1');
    assert.equal(late.page.of('state').length, before + 1);

    potatoGames.closed('g1', { kind: 'done', prize: 1000, winners: [{ id: 'u2', name: 'Bo', won: 1000 }], out: [], endedAt: 1 });
    assert.equal(player.page.lastState().live, null);
    assert.equal(player.page.lastState().last?.winners[0]?.name, 'Bo');
    player.connection.closed();
    late.connection.closed();
  } finally {
    potatoGames.closed('g1', null);
  }
});

test("hot potato watching: a watch link sees the player's view, and says nothing taken (there's no chat)", async () => {
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
    await player.connection.receive('{"t":"chat","text":"mine!"}');
    assert.equal(player.page.got.at(-1)?.t, 'error', 'chat is a message the page can no longer say');
    watcher.closed();
    player.connection.closed();
  } finally {
    potatoGames.closed('g1', null);
  }
});

test('laser grid page: playing or watching, and how the last one ended', () => {
  const game: LaserGame = {
    live: () => ({ phase: 'ready', prize: 1, bonusPerPlayer: 0, fine: 100, joinEndsAt: 1, rounds: 8, round: 1, windowMs: 3000, slots: 5, duckSlot: null, decoys: [], deadline: null, players: [], fastest: null }),
    plays: (userId) => userId === 'u1',
    join: () => 'closed',
    press: () => ({ result: 'closed' }),
  };
  laserGames.opened('g2', game);
  try {
    assert.equal(laserState('g2', 'u1').playing, true);
    assert.equal(laserState('g2', 'u2').playing, false);
    assert.equal(laserState('g2', 'u2').live?.duckSlot, null);
  } finally {
    laserGames.closed('g2', { kind: 'nobody', prize: 1, lastRound: 0, winners: [], caught: [], endedAt: 1 });
  }
  assert.equal(laserState('g2', 'u1').live, null);
  assert.equal(laserState('g2', 'u1').last?.kind, 'nobody');
});
