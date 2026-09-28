import type { WebSocket } from 'ws';
import { sumBets } from '../lib/game/table-bets.js';
import { addWatcher, playerJoined, playerLeft, removeWatcher } from './live.js';
import type { PartyTable, PartyTables, Peer, TableDeps } from './party-table.js';
import { parseTableMessage, type ErrorCode, type ServerMessage } from './table-protocol.js';
import { verifyToken, verifyWatchToken, type Player } from './token.js';

/*
 * The web socket a shared-table game's page (baccarat, roulette) plays through (server.ts takes the
 * connections, and only from the site). A connection's first message must be `hello` with the token
 * from the player's link; the player is then seated at a shared table (party-table.ts), and sends
 * their chips as they put them down. One page per player: a new one takes over their seat.
 *
 * A connection can say `watch` instead, with a watch link's token: it then only follows another
 * member's table as they see it (live.ts), and anything else it says is ignored.
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

function refuse(peer: Peer, code: ErrorCode): void {
  peer.send({ t: 'error', code });
  peer.close();
}

/** One connection to a table game: what it says goes to `receive`, and `closed` when it goes away. */
export interface TableConnection {
  receive(text: string): Promise<void>;
  closed(): void;
}

/** Plays `tables`' game with the page `page`. */
export function openTableConnection<S extends string, R, V, X>(tables: PartyTables<S, R, V, X>, page: Peer, deps: TableDeps<S, R> = tables.realDeps): TableConnection {
  const { game } = tables;
  /** What the table sends through: the page, and (once it's a player's) their watchers too. */
  let peer: Peer = page;
  let player: Player | null = null;
  let table: PartyTable<S, R, V, X> | null = null;
  let watching: { guildId: string; userId: string } | null = null;
  let gone = false;

  let budget = game.web.messagesPerSecond;
  const refill = setInterval(() => (budget = game.web.messagesPerSecond), 1000);
  refill.unref();
  const hello = setTimeout(() => refuse(peer, 'bad_message'), game.web.helloMs);
  hello.unref();

  const receive = async (text: string): Promise<void> => {
    if (--budget < 0) return refuse(peer, 'bad_message');
    const message = parseTableMessage(text, game.parseBets);
    if (!message) return refuse(peer, 'bad_message');
    if (watching) return;

    if (message.t === 'watch') {
      if (player !== null) return refuse(peer, 'bad_message');
      clearTimeout(hello);
      const watch = verifyWatchToken(message.token);
      if (!watch) return refuse(peer, 'bad_token');
      const target = { guildId: watch.viewer.guildId, userId: watch.targetId };
      const added = addWatcher(game.live, target.guildId, target.userId, page);
      if (!added.ok) return refuse(page, added.reason);
      watching = target;
      return;
    }

    if (message.t === 'hello') {
      if (player !== null) return refuse(peer, 'bad_message');
      clearTimeout(hello);
      const who = verifyToken(message.token);
      if (!who) return refuse(peer, 'bad_token');
      player = who;
      peer = playerJoined(game.live, who.guildId, who.userId, who.name, page, (m) => describe(m as ServerMessage<string, V>, game.outcome)) as Peer;
      const seated = await tables.seat(who, peer, deps);
      table = seated.table;
      if (seated.replaced) refuse(seated.replaced, 'replaced');
      // Gone while being seated: give the seat back.
      if (gone) table.leave(who.userId, peer);
      return;
    }

    if (!player || !table) return refuse(peer, 'bad_message');
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
  };

  const closed = (): void => {
    gone = true;
    clearInterval(refill);
    clearTimeout(hello);
    if (watching) removeWatcher(game.live, watching.guildId, watching.userId, page);
    if (!player) return;
    table?.leave(player.userId, peer);
    playerLeft(game.live, player.guildId, player.userId, page);
  };

  return { receive, closed };
}

/**
 * Plays `tables`' game over a web socket just opened (server.ts has checked where it came from).
 * `avatar` is the member's profile picture in the server, when the bot knows it.
 */
export function serveTable<S extends string, R, V, X>(tables: PartyTables<S, R, V, X>, socket: WebSocket, avatar?: TableDeps<S, R>['avatar']): void {
  const page: Peer = {
    send: (message) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    },
    close: () => socket.close(),
  };
  const connection = openTableConnection(tables, page, avatar ? { ...tables.realDeps, avatar } : tables.realDeps);
  socket.on('message', (data, isBinary) => {
    if (isBinary) {
      refuse(page, 'bad_message');
      return;
    }
    void connection.receive(data.toString());
  });
  socket.on('close', () => connection.closed());
  socket.on('error', () => socket.terminate());
}
