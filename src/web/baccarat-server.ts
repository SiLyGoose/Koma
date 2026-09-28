import type { WebSocket } from 'ws';
import { BACCARAT_WEB } from '../constants/index.js';
import { totalBet } from '../lib/game/baccarat.js';
import { parseClientMessage, type ErrorCode, type ServerMessage } from './baccarat-protocol.js';
import { realTableDeps, seatPlayer, type BaccaratTable, type Peer, type TableDeps } from './baccarat-table.js';
import { addWatcher, playerJoined, playerLeft, removeWatcher } from './live.js';
import { verifyToken, verifyWatchToken, type Player } from './token.js';

/*
 * The web socket baccarat's page plays through (server.ts takes the connections, and only from the
 * site). A connection's first message must be `hello` with the token from the player's link; the
 * player is then seated at a shared table (baccarat-table.ts), and sends their chips as they put
 * them down. One page per player: a new one takes over their seat.
 *
 * A connection can say `watch` instead, with a watch link's token: it then only follows another
 * member's table as they see it (live.ts), and anything else it says is ignored.
 */

export type { Peer } from './baccarat-table.js';

/** A few words on what a player is doing, for the online list, from a message sent to their page. */
function describe(message: ServerMessage): string | null {
  if (message.t !== 'table') return null;
  const { state } = message;
  const at = `Table ${state.table} · ${state.seats.length}/${state.maxSeats}`;
  const you = state.seats.find((s) => s.userId === state.you);
  if (state.phase === 'dealing' && state.round && you?.result) {
    const { net } = you.result;
    const winner = state.round.winner === 'tie' ? 'Tie' : `${state.round.winner === 'player' ? 'Player' : 'Banker'} wins`;
    return `${at} · ${winner} · ${net >= 0 ? '+' : '−'}${Math.abs(net).toLocaleString('en-US')}`;
  }
  const down = you ? totalBet(you.bets) : 0;
  return down > 0 ? `${at} · ${down.toLocaleString('en-US')} down` : `${at} · Placing chips`;
}

function refuse(peer: Peer, code: ErrorCode): void {
  peer.send({ t: 'error', code });
  peer.close();
}

/** One connection to baccarat: what it says goes to `receive`, and `closed` when it goes away. */
export interface TableConnection {
  receive(text: string): Promise<void>;
  closed(): void;
}

/** Plays baccarat with the page `page`. */
export function openConnection(page: Peer, deps: TableDeps = realTableDeps): TableConnection {
  /** What the table sends through: the page, and (once it's a player's) their watchers too. */
  let peer: Peer = page;
  let player: Player | null = null;
  let table: BaccaratTable | null = null;
  let watching: { guildId: string; userId: string } | null = null;
  let gone = false;

  let budget = BACCARAT_WEB.messagesPerSecond;
  const refill = setInterval(() => (budget = BACCARAT_WEB.messagesPerSecond), 1000);
  refill.unref();
  const hello = setTimeout(() => refuse(peer, 'bad_message'), BACCARAT_WEB.helloMs);
  hello.unref();

  const receive = async (text: string): Promise<void> => {
    if (--budget < 0) return refuse(peer, 'bad_message');
    const message = parseClientMessage(text);
    if (!message) return refuse(peer, 'bad_message');
    if (watching) return;

    if (message.t === 'watch') {
      if (player !== null) return refuse(peer, 'bad_message');
      clearTimeout(hello);
      const watch = verifyWatchToken(message.token);
      if (!watch) return refuse(peer, 'bad_token');
      const target = { guildId: watch.viewer.guildId, userId: watch.targetId };
      const added = addWatcher('baccarat', target.guildId, target.userId, page);
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
      peer = playerJoined('baccarat', who.guildId, who.userId, who.name, page, (m) => describe(m as ServerMessage)) as Peer;
      const seated = await seatPlayer(who, peer, deps);
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
    if (watching) removeWatcher('baccarat', watching.guildId, watching.userId, page);
    if (!player) return;
    table?.leave(player.userId, peer);
    playerLeft('baccarat', player.guildId, player.userId, page);
  };

  return { receive, closed };
}

/**
 * Plays baccarat over a web socket just opened (server.ts has checked where it came from).
 * `avatar` is the member's profile picture in the server, when the bot knows it.
 */
export function serveBaccarat(socket: WebSocket, avatar?: TableDeps['avatar']): void {
  const page: Peer = {
    send: (message: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    },
    close: () => socket.close(),
  };
  const connection = openConnection(page, avatar ? { ...realTableDeps, avatar } : realTableDeps);
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
