import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHAT, MINESWEEPER_LEVELS, MINESWEEPER_ROOM } from '../src/constants/index.js';
import { DEFAULTS } from '../src/config.js';
import { findSpec, SPECS, validateSettings } from '../src/lib/settings-spec.js';
import { chordTile, minesNear, neighbours, newBoard, openTile, seenTiles, sharePool, speedMultiplier, toggleFlag, type Board, type MinesweeperRewards } from '../src/lib/game/minesweeper.js';
import { tenorGif } from '../src/web/games/chat.js';
import { parseClientMessage, type RoomState, type ServerMessage } from '../src/web/games/minesweeper/protocol.js';
import { MinesweeperRooms, type Peer } from '../src/web/games/minesweeper/room.js';
import type { Player } from '../src/web/auth/token.js';

/*
 * Minesweeper: its rules (lib/game/minesweeper.ts), and a server's room (web/games/minesweeper/room.ts):
 * players coming and going, the clock, and whose cursor is told to whom.
 */

/** A 4x4 board with mines at `mines`, already laid. */
function laidBoard(mines: number[]): Board {
  const board = newBoard({ cols: 4, rows: 4, mines: mines.length });
  for (const i of mines) board.mine[i] = true;
  board.laid = true;
  return board;
}

/** Always the second lowest number: the mines go on the tiles after the first one free, which is left shut in among them. */
const second = (min: number, max: number): number => Math.min(min + 1, max);

// ---------------------------------------------------------------------------
// The rules

test('minesweeper: the first tile opened, and the tiles round it, are never mines', () => {
  for (const level of Object.values(MINESWEEPER_LEVELS)) {
    for (const first of [0, level.cols - 1, Math.floor((level.cols * level.rows) / 2), level.cols * level.rows - 1]) {
      const board = newBoard(level);
      assert.ok(openTile(board, first));
      assert.equal(board.mine.filter(Boolean).length, level.mines);
      assert.equal(board.status, 'playing');
      for (const i of [first, ...neighbours(board, first)]) assert.equal(board.mine[i], false);
    }
  }
});

test('minesweeper: a tile touching no mine opens the tiles round it, and so on', () => {
  // A mine in the bottom right corner: everything else opens from the top left, and that wins.
  const board = laidBoard([15]);
  assert.ok(openTile(board, 0));
  assert.equal(board.opened, 15);
  assert.equal(board.status, 'won');
  assert.equal(seenTiles(board), '000000000011001F');
});

test('minesweeper: a flag keeps a tile shut, and a mine loses and shows the board', () => {
  const board = laidBoard([5, 15]);
  assert.ok(toggleFlag(board, 5));
  assert.equal(openTile(board, 5), false);
  assert.ok(toggleFlag(board, 4));
  assert.ok(openTile(board, 0));
  assert.equal(seenTiles(board), '1###FF##########');
  assert.equal(minesNear(board, 0), 1);
  assert.ok(openTile(board, 15));
  assert.equal(board.status, 'lost');
  // The flag on no mine is shown wrong, the mine opened apart from the one flagged.
  assert.equal(seenTiles(board), '1###XF#########!');
  // Nothing more can be done on it.
  assert.equal(openTile(board, 1), false);
  assert.equal(toggleFlag(board, 1), false);
});

test('minesweeper: a chord opens the rest round a tile with all its flags, right or wrong', () => {
  const board = laidBoard([0, 15]);
  assert.ok(openTile(board, 5));
  // Not enough flags round it yet.
  assert.equal(chordTile(board, 5), false);
  toggleFlag(board, 0);
  assert.ok(chordTile(board, 5));
  assert.equal(board.status, 'won');

  const wrong = laidBoard([0, 15]);
  openTile(wrong, 5);
  toggleFlag(wrong, 1);
  assert.ok(chordTile(wrong, 5));
  assert.equal(wrong.status, 'lost');
  assert.equal(wrong.boom, 0);
});

test('minesweeper: only its own messages are read', () => {
  assert.deepEqual(parseClientMessage('{"t":"new","level":"hard"}'), { t: 'new', level: 'hard' });
  assert.equal(parseClientMessage('{"t":"new","level":"toString"}'), null);
  assert.deepEqual(parseClientMessage('{"t":"flag","index":7}'), { t: 'flag', index: 7 });
  assert.equal(parseClientMessage('{"t":"open","index":-1}'), null);
  assert.deepEqual(parseClientMessage('{"t":"cursor","at":[2.5,0.25]}'), { t: 'cursor', at: [2.5, 0.25] });
  assert.deepEqual(parseClientMessage('{"t":"cursor","at":null}'), { t: 'cursor', at: null });
  assert.equal(parseClientMessage('{"t":"cursor","at":[1e9,0]}'), null);
  assert.equal(parseClientMessage('{"t":"cursor","at":[1]}'), null);
  assert.equal(parseClientMessage('{"t":"watch","token":"x"}'), null);
});

// ---------------------------------------------------------------------------
// The room

const player = (userId: string, guildId = 'g1'): Player => ({ guildId, userId, name: userId.toUpperCase() });

function page() {
  const sent: ServerMessage[] = [];
  const peer: Peer = { send: (m) => sent.push(m), close: () => {} };
  return {
    peer,
    sent,
    /** The room as this page was last told. */
    room(): RoomState {
      const last = sent.filter((m) => m.t === 'room').at(-1);
      assert.ok(last && last.t === 'room');
      return last.state;
    },
    cursors: () => sent.filter((m) => m.t === 'cursor'),
  };
}

/** What the boards pay in these tests: a Beginner board 100, and twice that in 20 seconds or less (par is 40). */
const REWARDS: MinesweeperRewards = { pool: { easy: 100, medium: 400, hard: 1_500 }, parSeconds: { easy: 40, medium: 180, hard: 480 }, speedBonus: 2 };

function setup() {
  let now = 1_000;
  /** What was put on record, like "bombs:b" or "wins:a,b". */
  const recorded: string[] = [];
  /** What was paid for each board cleared, like "a:60 b:40". */
  const paid: string[] = [];
  const rooms = new MinesweeperRooms({
    random: second,
    now: () => now,
    avatar: (_guildId, userId) => `pic:${userId}`,
    stats: async () => ({ bombs: 0, wins: 0, trolls: 0 }),
    record: (_guildId, userIds, stat) => recorded.push(`${stat}:${userIds.join(',')}`),
    rewards: () => REWARDS,
    pay: (_guildId, points) => paid.push([...points].map(([id, share]) => `${id}:${share}`).join(' ')),
  });
  return { rooms, recorded, paid, tick: (ms: number) => (now += ms) };
}

/** Who's in the room and in which colour, like "a:0 b:1". */
const colours = (state: RoomState): string => state.players.map((p) => `${p.id}:${p.colour}`).join(' ');

test('minesweeper room: a server plays one board together, and each is told the others, in their own colour', () => {
  const { rooms } = setup();
  const a = page();
  const b = page();
  const elsewhere = page();
  const room = rooms.join(player('a'), a.peer)?.room;
  assert.ok(room);
  assert.equal(rooms.join(player('b'), b.peer)?.room, room);
  assert.notEqual(rooms.join(player('c', 'g2'), elsewhere.peer)?.room, room);

  assert.equal(a.room().you, 'a');
  assert.equal(b.room().you, 'b');
  assert.deepEqual(a.room().players, [
    { id: 'a', name: 'A', avatar: 'pic:a', colour: 0, bombs: 0, wins: 0, trolls: 0 },
    { id: 'b', name: 'B', avatar: 'pic:b', colour: 1, bombs: 0, wins: 0, trolls: 0 },
  ]);
  assert.equal(elsewhere.room().players.length, 1);
  // A room starts on a beginner's board.
  assert.equal(a.room().game.level, 'easy');
  assert.equal(a.room().game.status, 'ready');
  assert.equal(a.room().game.tiles, '#'.repeat(81));
  // What one does, both see.
  room.play('a', 'flag', 80);
  assert.equal(b.room().game.tiles.at(-1), 'F');
  assert.equal(b.room().game.flags, 1);
});

test('minesweeper room: the clock runs from the first tile opened until the board is won or lost', () => {
  const { rooms, tick } = setup();
  const a = page();
  const b = page();
  const room = rooms.join(player('a'), a.peer)?.room;
  rooms.join(player('b'), b.peer);
  assert.ok(room);
  room.start('a', 'easy');

  // A flag doesn't start the clock.
  tick(5_000);
  room.play('a', 'flag', 0);
  assert.equal(a.room().game.status, 'ready');
  room.play('a', 'flag', 0);

  // The mines go on tiles 1 to 10, round the top left corner: opening the far corner opens all but it.
  room.play('a', 'open', 80);
  assert.equal(a.room().game.status, 'playing');
  assert.equal(a.room().game.elapsedMs, 0);

  tick(2_500);
  // Nothing opened: nothing changes.
  room.play('b', 'open', 80);
  room.play('b', 'open', 1);
  const game = b.room().game;
  assert.equal(game.status, 'lost');
  assert.equal(game.elapsedMs, 2_500);
  assert.equal(game.by, 'B');
  assert.equal(game.tiles.slice(0, 11), '#!*********');

  // Over: the clock has stopped, and anyone can start the next.
  tick(60_000);
  room.play('a', 'open', 40);
  room.start('b', 'medium');
  assert.equal(a.room().game.no, 3);
  assert.equal(a.room().game.level, 'medium');
  assert.equal(a.room().game.elapsedMs, 0);
  // And a board being played can be swapped for a new one too.
  room.play('a', 'open', 255);
  assert.equal(a.room().game.status, 'playing');
  room.start('a', 'hard');
  assert.equal(b.room().game.no, 4);
  assert.equal(b.room().game.status, 'ready');
  assert.equal(b.room().game.elapsedMs, 0);
});

test('minesweeper room: a board lost to a chord says whose wrong flag sent it into the mine', () => {
  const { rooms, recorded } = setup();
  const a = page();
  const b = page();
  const room = rooms.join(player('a'), a.peer)?.room;
  rooms.join(player('b'), b.peer);
  assert.ok(room);
  const record = (): string => a.room().players.map((p) => `${p.id} ${p.bombs}/${p.trolls}`).join(', ');
  // A flags a tile that will turn out safe. The mines go on tiles 1 to 10, and the rest opens round the flag.
  room.play('a', 'flag', 27);
  room.play('b', 'open', 80);
  assert.equal(a.room().game.status, 'playing');
  assert.deepEqual(a.room().game.blamed, []);
  // The 2 at tile 18 touches mines at 9 and 10: with B's flag on 9 and A's on 27, its chord opens 10.
  room.play('b', 'flag', 9);
  assert.deepEqual(a.room().game.flaggers, { 9: 'b', 27: 'a' });
  room.play('b', 'chord', 18);
  const game = a.room().game;
  assert.equal(game.status, 'lost');
  assert.equal(game.by, 'B');
  assert.deepEqual(game.blamed, ['A']);
  // It's a troll for A, and no mine of B's.
  assert.equal(record(), 'a 0/1, b 0/0');
  assert.deepEqual(recorded, ['trolls:a']);

  // A mine opened with a plain click is nobody's fault but theirs, whatever flags are about.
  room.start('a', 'easy');
  room.play('a', 'flag', 27);
  room.play('b', 'open', 80);
  room.play('b', 'open', 1);
  assert.equal(a.room().game.status, 'lost');
  assert.deepEqual(a.room().game.blamed, []);
  assert.equal(record(), 'a 0/1, b 1/0');

  // A chord sent into a mine by their own wrong flag is their mine, and nobody's troll.
  room.start('a', 'easy');
  room.play('b', 'flag', 27);
  room.play('b', 'open', 80);
  room.play('b', 'flag', 9);
  room.play('b', 'chord', 18);
  assert.deepEqual(a.room().game.blamed, ['B']);
  assert.equal(record(), 'a 0/1, b 2/0');
  assert.deepEqual(recorded, ['trolls:a', 'bombs:b', 'bombs:b']);
});

test('minesweeper room: a mine goes on the record of who opened it, a board cleared on everyone who opened a tile of it', () => {
  const { rooms, recorded } = setup();
  const [a, b, c] = [page(), page(), page()];
  // A comes with a record already.
  const room = rooms.join(player('a'), a.peer, { bombs: 4, wins: 2, trolls: 0 })?.room;
  rooms.join(player('b'), b.peer);
  rooms.join(player('c'), c.peer);
  assert.ok(room);
  const record = (): string => c.room().players.map((p) => `${p.id} ${p.bombs}/${p.wins}`).join(', ');
  assert.equal(record(), 'a 4/2, b 0/0, c 0/0');

  // B opens a mine: theirs alone.
  room.play('a', 'open', 80);
  room.play('b', 'open', 1);
  assert.equal(record(), 'a 4/2, b 1/0, c 0/0');
  assert.deepEqual(recorded, ['bombs:b']);

  // A and B clear the next between them (the one safe tile left is the corner); C only flagged.
  room.start('a', 'easy');
  room.play('c', 'flag', 5);
  room.play('a', 'open', 80);
  room.play('b', 'open', 0);
  assert.equal(c.room().game.status, 'won');
  assert.equal(record(), 'a 4/3, b 1/1, c 0/0');
  assert.deepEqual(recorded, ['bombs:b', 'wins:a,b']);

  // A new tab keeps what the room has counted, not what the database said when it was read.
  rooms.join(player('b'), page().peer, { bombs: 0, wins: 0, trolls: 0 });
  assert.equal(record(), 'a 4/3, b 1/1, c 0/0');

  // Someone who opened a tile and left still has the win put on record.
  room.start('a', 'easy');
  room.play('b', 'open', 80);
  rooms.join(player('b'), b.peer);
  room.leave('b', b.peer);
  room.play('a', 'open', 0);
  assert.equal(recorded.at(-1), 'wins:b,a');
});

test('minesweeper room: a cursor is told to everyone but its own page', () => {
  const { rooms } = setup();
  const [a, b, c] = [page(), page(), page()];
  const room = rooms.join(player('a'), a.peer)?.room;
  rooms.join(player('b'), b.peer);
  rooms.join(player('c'), c.peer);
  assert.ok(room);
  room.cursor('a', [2.5, 3]);
  room.cursor('a', null);
  assert.deepEqual(a.cursors(), []);
  for (const other of [b, c]) {
    assert.deepEqual(other.cursors(), [
      { t: 'cursor', id: 'a', at: [2.5, 3] },
      { t: 'cursor', id: 'a', at: null },
    ]);
  }
  // Someone not in the room moves nobody's cursor.
  room.cursor('z', [1, 1]);
  assert.equal(b.cursors().length, 2);
});

test('minesweeper room: a new tab takes over, a full room lets nobody else in, and an empty one is forgotten', () => {
  const { rooms } = setup();
  const a = page();
  const again = page();
  const b = page();
  const room = rooms.join(player('a'), a.peer)?.room;
  assert.ok(room);
  room.start('a', 'easy');
  const joined = rooms.join(player('a'), again.peer);
  assert.equal(joined?.replaced, a.peer);
  // They keep their colour, and the old page going away changes nothing.
  assert.equal(again.room().players[0]?.colour, 0);
  room.leave('a', a.peer);
  assert.equal(again.room().players.length, 1);

  rooms.join(player('b'), b.peer);
  room.leave('a', again.peer);
  assert.equal(colours(b.room()), 'b:1');
  // The colour the fewest have goes to the next to come.
  rooms.join(player('d'), page().peer);
  assert.equal(b.room().players[1]?.colour, 0);

  for (let i = 0; i < MINESWEEPER_ROOM.players - 2; i++) assert.ok(rooms.join(player(`p${i}`), page().peer));
  assert.equal(rooms.join(player('late'), page().peer), null);
  // Someone already in can still come back in another tab.
  assert.ok(rooms.join(player('b'), page().peer));

  // Everyone gone: the next to come finds a new room, on a beginner's board.
  const solo = new MinesweeperRooms();
  const s = page();
  const first = solo.join(player('s'), s.peer)?.room;
  first?.start('s', 'hard');
  first?.leave('s', s.peer);
  const back = page();
  assert.notEqual(solo.join(player('s'), back.peer)?.room, first);
  assert.equal(back.room().game.level, 'easy');
});

// ---------------------------------------------------------------------------
// What a board cleared pays

test('minesweeper reward: speed multiplies the pool, from par down to half of it', () => {
  assert.equal(speedMultiplier(40_000, 40, 1.5), 1);
  assert.equal(speedMultiplier(300_000, 40, 1.5), 1);
  assert.equal(speedMultiplier(30_000, 40, 1.5), 1.25);
  assert.equal(speedMultiplier(20_000, 40, 1.5), 1.5);
  assert.equal(speedMultiplier(1_000, 40, 1.5), 1.5);
  // Speed paying nothing.
  assert.equal(speedMultiplier(1_000, 40, 1), 1);
});

test('minesweeper reward: the pool is shared by tiles opened, in whole points that add up to it', () => {
  const share = (total: number, tiles: Record<string, number>): Record<string, number> => Object.fromEntries(sharePool(total, new Map(Object.entries(tiles))));
  assert.deepEqual(share(100, { a: 60, b: 40 }), { a: 60, b: 40 });
  assert.deepEqual(share(400, { a: 71 }), { a: 400 });
  // What rounding down leaves goes to whoever opened the most.
  assert.deepEqual(share(100, { a: 1, b: 1, c: 1 }), { a: 34, b: 33, c: 33 });
  assert.deepEqual(share(10, { a: 1, b: 70 }), { a: 0, b: 10 });
  assert.deepEqual(share(100, {}), {});
});

test('minesweeper reward: a board cleared pays its players by the tiles each opened, more for being quick, and one lost pays nobody', () => {
  const { rooms, paid, tick } = setup();
  const a = page();
  const b = page();
  const idle = page();
  const room = rooms.join(player('a'), a.peer)?.room;
  rooms.join(player('b'), b.peer);
  rooms.join(player('c'), idle.peer);
  assert.ok(room);
  assert.deepEqual(a.room().rewards, REWARDS);
  assert.equal(a.room().game.paid, null);

  // A board lost (the mines are on tiles 1 to 10) pays nobody.
  room.play('a', 'open', 80);
  room.play('b', 'open', 1);
  assert.equal(a.room().game.status, 'lost');
  assert.equal(a.room().game.paid, null);
  assert.deepEqual(paid, []);

  // The next is cleared in 30 seconds of a 40 second par, halfway to twice the pool: a opens all but
  // the corner (70 tiles), b the corner, c nothing.
  room.start('a', 'easy');
  room.play('c', 'flag', 5);
  room.play('a', 'open', 80);
  tick(30_000);
  room.play('b', 'open', 0);
  const { game } = idle.room();
  assert.equal(game.status, 'won');
  assert.deepEqual(game.paid, {
    bonus: 1.5,
    total: 150,
    shares: [
      { id: 'a', name: 'A', tiles: 70, points: 148 },
      { id: 'b', name: 'B', tiles: 1, points: 2 },
    ],
  });
  assert.deepEqual(paid, ['a:148 b:2']);

  // A new board has paid nothing yet.
  room.start('a', 'easy');
  assert.equal(a.room().game.paid, null);
});

test('minesweeper reward: its settings exist, are in their own group, and start at the tuned values', () => {
  assert.deepEqual(DEFAULTS.minesweeper, { pool: { easy: 50, medium: 400, hard: 1_500 }, parSeconds: { easy: 40, medium: 180, hard: 480 }, speedBonus: 1.5 });
  const keys = SPECS.filter((s) => s.key.startsWith('minesweeper.')).map((s) => s.key);
  assert.deepEqual(keys, [...['easy', 'medium', 'hard'].map((l) => `minesweeper.pool.${l}`), ...['easy', 'medium', 'hard'].map((l) => `minesweeper.parSeconds.${l}`), 'minesweeper.speedBonus']);
  for (const key of keys) assert.equal(findSpec(key)?.group, 'Minesweeper');
  assert.deepEqual(validateSettings(structuredClone(DEFAULTS)), []);
});

// ---------------------------------------------------------------------------
// The chat (web/games/chat.ts), as the room has it

test('chat: a line is tidied, and one that says nothing or too much is not read', () => {
  assert.deepEqual(parseClientMessage(JSON.stringify({ t: 'chat', text: '  top  left\nis safe ' })), { t: 'chat', text: 'top left is safe' });
  assert.equal(parseClientMessage('{"t":"chat","text":"   "}'), null);
  assert.equal(parseClientMessage('{"t":"chat","text":7}'), null);
  assert.equal(parseClientMessage(JSON.stringify({ t: 'chat', text: 'x'.repeat(CHAT.maxLength + 1) })), null);
  assert.ok(parseClientMessage(JSON.stringify({ t: 'chat', text: 'x'.repeat(CHAT.maxLength) })));
});

test('chat: a pasted picture is read with or without words, unless it is not one or is too big', () => {
  const image = 'data:image/webp;base64,UklGRg==';
  assert.deepEqual(parseClientMessage(JSON.stringify({ t: 'chat', text: '', image })), { t: 'chat', text: '', image });
  assert.deepEqual(parseClientMessage(JSON.stringify({ t: 'chat', text: ' look ', image })), { t: 'chat', text: 'look', image });
  assert.equal(parseClientMessage(JSON.stringify({ t: 'chat', text: 'look', image: 7 })), null);
  assert.equal(parseClientMessage(JSON.stringify({ t: 'chat', text: 'look', image: 'https://example.com/a.png' })), null);
  assert.equal(parseClientMessage(JSON.stringify({ t: 'chat', text: 'look', image: 'data:image/svg+xml;base64,PHN2Zz4=' })), null);
  assert.equal(parseClientMessage(JSON.stringify({ t: 'chat', text: 'look', image: 'data:image/png;base64,"><script>' })), null);
  assert.equal(parseClientMessage(JSON.stringify({ t: 'chat', text: '', image: `data:image/png;base64,${'A'.repeat(CHAT.maxImageLength)}` })), null);
});

test('chat: the GIF a tenor.com page is about is read off it', () => {
  const gif = 'https://media1.tenor.com/m/PKP-q7Udx4YAAAAC/tell-me-more-salem.gif';
  assert.equal(tenorGif(`<head><meta class="dynamic" property="og:image" content="${gif}"></head>`), gif);
  assert.equal(tenorGif('<meta property="og:image" content="https://example.com/x.gif">'), undefined);
  assert.equal(tenorGif('<html></html>'), undefined);
});

test('chat: a room keeps only its last pasted pictures, and a line that was only an old one goes', () => {
  const { rooms, tick } = setup();
  const a = page();
  const room = rooms.join(player('a'), a.peer)?.room;
  assert.ok(room);
  const image = 'data:image/png;base64,AAAA';
  room.say('a', 'with words', image);
  // Too soon after their last for a picture.
  tick(CHAT.gapMs);
  room.say('a', 'too soon', image);
  tick(CHAT.imageGapMs);
  room.say('a', '', image);
  for (let i = 0; i < CHAT.keepImages; i++) {
    tick(CHAT.imageGapMs);
    room.say('a', `picture ${i}`, image);
  }
  // A GIF's address isn't a picture the room keeps itself.
  tick(CHAT.gapMs);
  room.say('a', 'a gif', 'https://media.tenor.com/x.gif');
  assert.equal(a.sent.filter((m) => m.t === 'chat').length, CHAT.keepImages + 3);

  const late = page();
  rooms.join(player('b'), late.peer);
  const history = late.sent.find((m) => m.t === 'chats');
  assert.ok(history && history.t === 'chats');
  assert.deepEqual(history.lines[0], { no: 1, id: 'a', name: 'A', text: 'with words', at: history.lines[0]?.at });
  assert.equal(history.lines[1]?.text, 'picture 0');
  assert.equal(history.lines.filter((l) => l.image === image).length, CHAT.keepImages);
  assert.equal(history.lines.at(-1)?.image, 'https://media.tenor.com/x.gif');
});

test('chat: what one says everyone in the room is told, and whoever joins is told the last of it', () => {
  const { rooms, tick } = setup();
  const a = page();
  const b = page();
  const room = rooms.join(player('a'), a.peer)?.room;
  rooms.join(player('b'), b.peer);
  assert.ok(room);
  const said = (p: ReturnType<typeof page>): string[] => p.sent.flatMap((m) => (m.t === 'chat' ? [`${m.line.name}: ${m.line.text}`] : []));
  // Joining, the room's lines so far: none yet.
  assert.deepEqual(a.sent.find((m) => m.t === 'chats'), { t: 'chats', lines: [] });

  room.say('a', 'corner is safe');
  // Too soon after their last: dropped.
  room.say('a', 'again');
  tick(CHAT.gapMs);
  room.say('b', 'ok');
  // Someone not in the room says nothing.
  room.say('z', 'hello?');
  assert.deepEqual(said(a), ['A: corner is safe', 'B: ok']);
  assert.deepEqual(said(b), said(a));

  // The room keeps only its last lines, for whoever joins.
  for (let i = 0; i < CHAT.keep; i++) {
    tick(CHAT.gapMs);
    room.say('a', `line ${i}`);
  }
  const late = page();
  rooms.join(player('c'), late.peer);
  const history = late.sent.find((m) => m.t === 'chats');
  assert.ok(history && history.t === 'chats');
  assert.equal(history.lines.length, CHAT.keep);
  assert.equal(history.lines[0]?.text, 'line 0');
  assert.equal(history.lines.at(-1)?.no, CHAT.keep + 2);
});
