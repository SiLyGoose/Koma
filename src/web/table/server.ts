import type { WebSocket } from 'ws';
import { sumBets } from '../../lib/game/casino/table-bets.js';
import { openGameConnection, refuse, serveSocket, type Connection } from '../connection.js';
import type { PartyTable, PartyTables, Peer, TableDeps } from './table.js';
import { parseTableMessage, type ServerMessage } from './protocol.js';

/*
 * The web socket a shared-table game's page (baccarat, roulette) plays through (connection.ts does
 * the greeting and watching). Once the player says hello they are seated at a shared table
 * (web/table/table.ts), and send their chips as they put them down. One page per player: a new one takes
 * over their seat.
 */

/** A few words on what a player is doing, for the online list, from a message sent to their page. */
function describe<V>(message: ServerMessage<string, V>, outcome: (round: V) => string): string | null {
  if (message.t !== 'table') return null;
  const { state } = message;
  const at = `Table ${state.table} · ${state.seats.length}/${state.maxSeats}`;
  const you = state.seats.find((s) => s.userId === state.you);
  if (state.phase === 'dealing' && state.round && you?.result) {
    const { net } = you.result;
    return `${at} · ${outcome(state.round)} · ${net >= 0 ? '+' : '−'}${Math.abs(net).toLocaleString('en-US')}`;
  }
  const down = you ? sumBets(you.bets) : 0;
  return down > 0 ? `${at} · ${down.toLocaleString('en-US')} down` : `${at} · Placing chips`;
}

export type TableConnection = Connection;

/** Plays `tables`' game with the page `page`. */
export function openTableConnection<S extends string, R, V, X>(tables: PartyTables<S, R, V, X>, page: Peer, deps: TableDeps<S, R> = tables.realDeps): Connection {
  const { game } = tables;
  let table: PartyTable<S, R, V, X> | null = null;

  return openGameConnection(
    {
      live: game.live,
      limits: game.web,
      parse: (text) => parseTableMessage(text, game.parseBets),
      describe: (m) => describe(m as ServerMessage<string, V>, game.outcome),
    },
    page,
    {
      async hello(hello) {
        const { player } = hello;
        const peer = hello.join();
        const seated = await tables.seat(player, peer, deps);
        table = seated.table;
        if (seated.replaced) refuse(seated.replaced, 'replaced');
        // Gone while being seated: give the seat back.
        if (hello.gone) table.leave(player.userId, peer);
      },

      async message(player, peer, message) {
        if (!table) return refuse(peer, 'bad_message');
        // A vote to deal now (turned down quietly once the round is being dealt).
        if (message.t === 'deal') {
          table.setReady(player.userId, message.ready);
          return;
        }
        // Chips.
        const refusal = table.setBets(player.userId, message.bets);
        if (refusal) {
          peer.send({ t: 'refused', seq: message.seq, ...refusal });
          table.resend(player.userId);
        }
      },

      left(player, peer) {
        table?.leave(player.userId, peer);
      },
    },
  );
}

/**
 * Plays `tables`' game over a web socket just opened (server.ts has checked where it came from).
 * `avatar` is the member's profile picture in the server, when the bot knows it.
 */
export function serveTable<S extends string, R, V, X>(tables: PartyTables<S, R, V, X>, socket: WebSocket, avatar?: TableDeps<S, R>['avatar']): void {
  const deps = avatar ? { ...tables.realDeps, avatar } : tables.realDeps;
  serveSocket<ServerMessage>(socket, (page) => openTableConnection(tables, page, deps));
}
