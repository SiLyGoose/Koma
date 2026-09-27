import type { WebSocket } from 'ws';
import { MINE_WEB } from '../constants/index.js';
import { parseClientMessage, type ServerMessage } from './mine-protocol.js';
import { findSession, lobbyFor, refuse, startWebRun, type MineSession, type Peer } from './mine-session.js';
import { playerKey, verifyToken, type Player } from './token.js';

/*
 * The web socket the mine's web page plays through (server.ts takes the connections, and only from
 * the site). A connection's first message must be `hello` with the token from the player's link. After that
 * it plays that player's run if one is going (mine-session.ts), and otherwise gets the lobby, from
 * which it can start one. One page per player: a new one takes over from the one before.
 */

/** The page connected for each player (playerKey). */
const connected = new Map<string, Peer>();

/** Plays the mine over a web socket just opened (server.ts has checked where it came from). */
export function serveMine(socket: WebSocket): void {
  const peer: Peer = {
    send: (message: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    },
    close: () => socket.close(),
  };
  let player: Player | null = null;
  /** The bet and mines of the last round played here, for the lobby to start from. */
  let lastBet: number | null = null;
  let lastMines: number | null = null;
  let starting = false;

  // A small budget of messages a second: far more than anyone can press keys, but not a flood.
  let budget = MINE_WEB.messagesPerSecond;
  const refill = setInterval(() => (budget = MINE_WEB.messagesPerSecond), 1000);
  refill.unref();
  const hello = setTimeout(() => refuse(peer, 'bad_message'), MINE_WEB.helloMs);
  hello.unref();

  const isCurrent = (): boolean => player !== null && connected.get(playerKey(player)) === peer;

  const sendLobby = async (): Promise<void> => {
    if (!player || !isCurrent()) return;
    try {
      peer.send({ t: 'lobby', lobby: await lobbyFor(player, lastBet, lastMines) });
    } catch (err) {
      console.error('Could not show the mine lobby:', err);
    }
  };

  /** Plays `session` on this page, and goes back to the lobby when it is over. */
  const play = (session: MineSession, seq: number): void => {
    lastBet = session.bet;
    lastMines = session.mines;
    session.attach(peer, seq);
    void session.ended.then(() => {
      session.detach(peer);
      return sendLobby();
    });
  };

  socket.on('message', (data, isBinary) => {
    void (async () => {
      if (isBinary || --budget < 0) return refuse(peer, 'bad_message');
      const message = parseClientMessage(data.toString());
      if (!message) return refuse(peer, 'bad_message');

      if (message.t === 'hello') {
        if (player !== null) return refuse(peer, 'bad_message');
        clearTimeout(hello);
        const who = verifyToken(message.token);
        if (!who) return refuse(peer, 'bad_token');
        player = who;
        const key = playerKey(who);
        const before = connected.get(key);
        connected.set(key, peer);
        if (before) refuse(before, 'replaced');
        const session = findSession(who);
        if (session && !session.over) play(session, 0);
        else await sendLobby();
        return;
      }

      if (!player || !isCurrent()) return refuse(peer, 'bad_message');
      const session = findSession(player);

      if (message.t === 'start') {
        if ((session && !session.over) || starting) return peer.send({ t: 'refused', seq: message.seq, reason: 'busy' });
        starting = true;
        try {
          const started = await startWebRun(player, message.bet, message.mines);
          if (!started.ok) {
            const { ok: _, ...refusal } = started;
            peer.send({ t: 'refused', seq: message.seq, ...refusal });
            return sendLobby();
          }
          if (isCurrent()) play(started.session, message.seq);
          else started.session.detach(peer);
        } catch (err) {
          console.error('Could not start a mine run from the web:', err);
          peer.send({ t: 'refused', seq: message.seq, reason: 'busy' });
        } finally {
          starting = false;
        }
        return;
      }

      // A move or cash out with no run going (it just ended): the lobby is on its way.
      if (!session) return;
      await session.handle(peer, message);
    })();
  });

  socket.on('close', () => {
    clearInterval(refill);
    clearTimeout(hello);
    if (!player) return;
    findSession(player)?.detach(peer);
    if (isCurrent()) connected.delete(playerKey(player));
  });
  socket.on('error', () => socket.terminate());
}
