import type { WebSocket } from 'ws';
import { CONFIG } from '../config.js';
import { BACCARAT_CHIPS, BACCARAT_WEB } from '../constants/index.js';
import type { BaccaratBets } from '../lib/game/baccarat.js';
import { getBalance, playBaccarat } from '../services/economy/index.js';
import { parseClientMessage, type ErrorCode, type RoundView, type ServerMessage, type Table } from './baccarat-protocol.js';
import { addWatcher, playerJoined, playerLeft, removeWatcher, type LivePeer } from './live.js';
import { playerKey, verifyToken, verifyWatchToken, type Player } from './token.js';

/*
 * The web socket baccarat's page plays through (server.ts takes the connections, and only from the
 * site). A connection's first message must be `hello` with the token from the player's link; it is
 * then sent the table, and can deal rounds. Each round is settled at once (services/economy/baccarat.ts),
 * so nothing is left over if the page goes away. One page per player: a new one takes over.
 *
 * A connection can say `watch` instead, with a watch link's token: it then only follows another
 * member's rounds (live.ts), and anything else it says is ignored.
 */

/** Where the table sends its messages: a WebSocket, or a fake one in tests. */
export type Peer = LivePeer & { send(message: ServerMessage): void };

/** The points side and the clock, so tests can stand in for them. */
export interface BaccaratDeps {
  play: typeof playBaccarat;
  balance: (guildId: string, userId: string) => Promise<number>;
  now: () => number;
}

const realDeps: BaccaratDeps = {
  play: playBaccarat,
  balance: async (guildId, userId) => (await getBalance(guildId, userId)).points,
  now: Date.now,
};

const WINNER = { player: 'Player', banker: 'Banker', tie: 'Tie' } as const;

/** A few words on what a player is doing, for the online list, from a message sent to their page. */
function describe(message: ServerMessage): string | null {
  if (message.t === 'table') return 'Placing chips';
  if (message.t !== 'round') return null;
  const { round } = message;
  const net = round.net >= 0 ? `+${round.net.toLocaleString('en-US')}` : `−${(-round.net).toLocaleString('en-US')}`;
  return `${round.playerTotal}–${round.bankerTotal}, ${WINNER[round.winner]}${round.winner === 'tie' ? '' : ' wins'} · ${net}`;
}

/** The page playing for each player (playerKey). */
const connected = new Map<string, Peer>();

function refuse(peer: Peer, code: ErrorCode): void {
  peer.send({ t: 'error', code });
  peer.close();
}

/** One connection to the table: what it says goes to `receive`, and `closed` when it goes away. */
export interface TableConnection {
  receive(text: string): Promise<void>;
  closed(): void;
}

/** Plays baccarat with the page `page`. */
export function openTable(page: Peer, deps: BaccaratDeps = realDeps): TableConnection {
  /** What the game sends through: the page, and (once it's a player's) their watchers too. */
  let peer: Peer = page;
  let player: Player | null = null;
  let watching: { guildId: string; userId: string } | null = null;
  let lastBets: BaccaratBets | null = null;
  /** A round is being worked out; `lastDeal` is when the last one was dealt. */
  let dealing = false;
  let lastDeal = -Infinity;

  let budget = BACCARAT_WEB.messagesPerSecond;
  const refill = setInterval(() => (budget = BACCARAT_WEB.messagesPerSecond), 1000);
  refill.unref();
  const hello = setTimeout(() => refuse(peer, 'bad_message'), BACCARAT_WEB.helloMs);
  hello.unref();

  const isCurrent = (): boolean => player !== null && connected.get(playerKey(player)) === peer;

  const table = async (who: Player): Promise<Table> => {
    const { minBet, maxBet, payout } = CONFIG.baccarat;
    return {
      player: who.name,
      balance: await deps.balance(who.guildId, who.userId),
      minBet,
      maxBet,
      chips: [...BACCARAT_CHIPS],
      payouts: { player: 1, ...payout },
      lastBets,
    };
  };

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
      const key = playerKey(who);
      const before = connected.get(key);
      connected.set(key, peer);
      if (before) refuse(before, 'replaced');
      try {
        peer.send({ t: 'table', table: await table(who) });
      } catch (err) {
        console.error('Could not show the baccarat table:', err);
      }
      return;
    }

    // A deal.
    if (!player || !isCurrent()) return refuse(peer, 'bad_message');
    if (dealing || deps.now() - lastDeal < BACCARAT_WEB.dealMs) return peer.send({ t: 'refused', seq: message.seq, reason: 'busy' });
    dealing = true;
    try {
      const result = await deps.play(player.guildId, player.userId, message.bets);
      if (!result.ok) {
        const { ok: _, ...refusal } = result;
        peer.send({ t: 'refused', seq: message.seq, ...refusal });
        return;
      }
      lastDeal = deps.now();
      lastBets = message.bets;
      const { round, bets, bet, payout, net, balance } = result;
      const view: RoundView = {
        player: round.player,
        banker: round.banker,
        order: round.order,
        playerTotal: round.playerTotal,
        bankerTotal: round.bankerTotal,
        winner: round.winner,
        natural: round.natural,
        bets,
        bet,
        payout,
        net,
        balance,
      };
      peer.send({ t: 'round', seq: message.seq, round: view });
    } catch (err) {
      console.error('A baccarat round failed:', err);
      peer.send({ t: 'refused', seq: message.seq, reason: 'busy' });
    } finally {
      dealing = false;
    }
  };

  const closed = (): void => {
    clearInterval(refill);
    clearTimeout(hello);
    if (watching) removeWatcher('baccarat', watching.guildId, watching.userId, page);
    if (!player) return;
    if (isCurrent()) connected.delete(playerKey(player));
    playerLeft('baccarat', player.guildId, player.userId, page);
  };

  return { receive, closed };
}

/** Plays baccarat over a web socket just opened (server.ts has checked where it came from). */
export function serveBaccarat(socket: WebSocket): void {
  const page: Peer = {
    send: (message: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    },
    close: () => socket.close(),
  };
  const table = openTable(page);
  socket.on('message', (data, isBinary) => {
    if (isBinary) {
      refuse(page, 'bad_message');
      return;
    }
    void table.receive(data.toString());
  });
  socket.on('close', () => table.closed());
  socket.on('error', () => socket.terminate());
}
