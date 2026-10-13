import type { WebSocket } from 'ws';
import { MINESWEEPER_LEVEL_NAMES, MINESWEEPER_WEB } from '../../../constants/index.js';
import { openGameConnection, refuse, serveSocket, type Connection } from '../connection.js';
import { parseClientMessage, type ClientMessage, type ServerMessage } from './protocol.js';
import { minesweeperRooms, type MinesweeperRoom, type MinesweeperRooms, type Peer, type RoomDeps } from './room.js';

/*
 * The web socket minesweeper's page plays through (connection.ts does the greeting). Once the player
 * says hello they join their server's room (room.ts), and play its board with everyone else there.
 * One page per player: a new one takes over. It isn't watched: anyone in the server can join in instead.
 */

export type { Peer } from './room.js';

/** A few words on what a player is doing, for the online list, from a message sent to their page. */
function describe(message: ServerMessage): string | null {
  if (message.t !== 'room') return null;
  const { game, players } = message.state;
  return `${MINESWEEPER_LEVEL_NAMES[game.level]} · ${players.length} playing`;
}

/** Plays minesweeper in `rooms` with the page `page`. */
export function openMinesweeperConnection(page: Peer, rooms: MinesweeperRooms = minesweeperRooms, deps: RoomDeps = rooms.realDeps): Connection {
  let room: MinesweeperRoom | null = null;

  return openGameConnection<ClientMessage, ServerMessage>(
    {
      live: 'minesweeper',
      limits: MINESWEEPER_WEB,
      parse: parseClientMessage,
      describe: (m) => describe(m as ServerMessage),
    },
    page,
    {
      async hello(hello) {
        const { player } = hello;
        const peer = hello.join();
        // Their record so far (none, if it can't be read: the game goes on without it).
        const stats = await deps.stats(player.guildId, player.userId).catch((err) => {
          console.error('Could not read a minesweeper record:', err);
          return { bombs: 0, wins: 0, trolls: 0 };
        });
        if (hello.gone) return;
        const joined = rooms.join(player, peer, stats, deps);
        if (!joined) return refuse(peer, 'full');
        room = joined.room;
        if (joined.replaced) refuse(joined.replaced, 'replaced');
      },

      async message(player, peer, message) {
        if (!room) return refuse(peer, 'bad_message');
        const { userId } = player;
        if (message.t === 'new') room.start(userId, message.level);
        else if (message.t === 'cursor') room.cursor(userId, message.at);
        else if (message.t === 'chat') room.say(userId, message.text);
        else room.play(userId, message.t, message.index);
      },

      left(player, peer) {
        room?.leave(player.userId, peer);
      },
    },
  );
}

/** Plays minesweeper over a web socket just opened. `avatar` is the member's profile picture in the server, when the bot knows it. */
export function serveMinesweeper(socket: WebSocket, avatar?: RoomDeps['avatar']): void {
  const deps = avatar ? { ...minesweeperRooms.realDeps, avatar } : minesweeperRooms.realDeps;
  serveSocket<ServerMessage>(socket, (page) => openMinesweeperConnection(page, minesweeperRooms, deps));
}
