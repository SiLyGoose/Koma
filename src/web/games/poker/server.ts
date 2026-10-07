import type { WebSocket } from 'ws';
import { POKER_WEB } from '../../../constants/index.js';
import { openGameConnection, refuse, serveSocket, type Connection } from '../connection.js';
import { parseClientMessage, type ClientMessage, type ServerMessage } from './protocol.js';
import { pokerTables, type Peer, type PokerDeps, type PokerTable, type PokerTables } from './table.js';

/*
 * The web socket poker's page plays through (connection.ts does the greeting). Once the player says
 * hello they join a table (table.ts), and sit down, move, stand up and add bots from there. One page
 * per player: a new one takes over. Poker can't be watched: a watcher would see the player's cards.
 */

export type { Peer } from './table.js';

/** A few words on what a player is doing, for the online list, from a message sent to their page. */
function describe(message: ServerMessage): string | null {
  if (message.t !== 'poker') return null;
  const { state } = message;
  const seated = state.seats.filter((s) => s !== null).length;
  const at = `Table ${state.table} · ${seated}/${state.seats.length}`;
  const you = state.seats.find((s) => s?.id === state.you);
  return you ? `${at} · ${you.chips.toLocaleString('en-US')} chips` : `${at} · Watching`;
}

/** Plays poker at `tables` with the page `page`. */
export function openPokerConnection(page: Peer, tables: PokerTables = pokerTables, deps: PokerDeps = tables.realDeps): Connection {
  let table: PokerTable | null = null;

  return openGameConnection<ClientMessage, ServerMessage>(
    {
      live: 'poker',
      limits: POKER_WEB,
      // Only `hello`: a watch link would show the player's cards.
      parse: parseClientMessage,
      describe: (m) => describe(m as ServerMessage),
    },
    page,
    {
      async hello(hello) {
        const { player } = hello;
        const peer = hello.join();
        const joined = await tables.join(player, peer, deps);
        table = joined.table;
        if (joined.replaced) refuse(joined.replaced, 'replaced');
        // Gone while joining.
        if (hello.gone) await table.leave(player.userId, peer);
      },

      async message(player, peer, message) {
        if (!table) return refuse(peer, 'bad_message');
        const { userId } = player;
        const refusal =
          message.t === 'sit'
            ? await table.sit(userId, message.chips, message.seat)
            : message.t === 'stand'
              ? await table.stand(userId)
              : message.t === 'act'
                ? await table.act(userId, message.move, message.amount)
                : message.add
                  ? await table.addBot(userId)
                  : await table.removeBot(userId, message.seat);
        if (refusal) peer.send({ t: 'refused', ...refusal });
      },

      left(player, peer) {
        void table?.leave(player.userId, peer);
      },
    },
  );
}

/** Plays poker over a web socket just opened. `avatar` is the member's profile picture in the server, when the bot knows it. */
export function servePoker(socket: WebSocket, avatar?: PokerDeps['avatar']): void {
  const deps = avatar ? { ...pokerTables.realDeps, avatar } : pokerTables.realDeps;
  serveSocket<ServerMessage>(socket, (page) => openPokerConnection(page, pokerTables, deps));
}
