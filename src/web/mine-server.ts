import { WebSocketServer, type WebSocket } from 'ws';
import { MINE_WEB } from '../constants/index.js';
import { parseClientMessage, type ServerMessage } from './mine-protocol.js';
import { findSession, lobbyFor, refuse, startWebRun, type MineSession, type Peer } from './mine-session.js';
import { playerKey, verifyToken, type Player } from './token.js';

/*
 * The WebSocket the mine's web page plays through. It listens on this machine only (Caddy in front
 * of it gives it its public wss:// address), and only takes connections from the page's own site.
 * A connection's first message must be `hello` with the token from the player's link. After that
 * it plays that player's run if one is going (mine-session.ts), and otherwise gets the lobby, from
 * which it can start one. One page per player: a new one takes over from the one before.
 */

export interface MineServerOptions {
  port: number;
  /** The page's origin, like "https://koma-ui.vercel.app": connections from anywhere else are turned away. */
  origin: string;
  host?: string;
}

/** The page connected for each player (playerKey). */
const connected = new Map<string, Peer>();

/** Starts the server. Returns a function that stops it. */
export function startMineServer({ port, origin, host = '127.0.0.1' }: MineServerOptions): () => Promise<void> {
  const wss = new WebSocketServer({
    host,
    port,
    path: MINE_WEB.path,
    maxPayload: MINE_WEB.maxMessageBytes,
    verifyClient: (info: { origin: string }) => info.origin === origin,
  });
  wss.on('listening', () => console.log(`The mine's web socket is listening on ${host}:${port}${MINE_WEB.path} for ${origin}.`));
  wss.on('error', (err) => console.error("The mine's web socket failed:", err));

  // Connections that stopped answering (a phone gone to sleep) are dropped.
  const alive = new WeakSet<WebSocket>();
  wss.on('connection', (socket) => {
    alive.add(socket);
    socket.on('pong', () => alive.add(socket));
    serve(socket);
  });
  const ping = setInterval(() => {
    for (const socket of wss.clients) {
      if (!alive.has(socket)) {
        socket.terminate();
        continue;
      }
      alive.delete(socket);
      socket.ping();
    }
  }, MINE_WEB.pingMs);
  ping.unref();

  return () =>
    new Promise((resolve) => {
      clearInterval(ping);
      for (const socket of wss.clients) socket.terminate();
      wss.close(() => resolve());
    });
}

function serve(socket: WebSocket): void {
  const peer: Peer = {
    send: (message: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    },
    close: () => socket.close(),
  };
  let player: Player | null = null;
  /** The bet of the last run played here, for the lobby's again / double / half. */
  let lastBet: number | null = null;
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
      peer.send({ t: 'lobby', lobby: await lobbyFor(player, lastBet) });
    } catch (err) {
      console.error('Could not show the mine lobby:', err);
    }
  };

  /** Plays `session` on this page, and goes back to the lobby when it is over. */
  const play = (session: MineSession, seq: number): void => {
    lastBet = session.bet;
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
          const started = await startWebRun(player, message.bet);
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
