import type { WebSocket } from 'ws';
import { MINE_WEB } from '../constants/index.js';
import { parseClientMessage, type ServerMessage } from './mines-protocol.js';
import { addWatcher, playerJoined, playerLeft, removeWatcher } from './live.js';
import { findSession, lobbyFor, refuse, startWebRun, type MineSession, type Peer } from './mines-session.js';
import { playerKey, verifyToken, verifyWatchToken, type Player } from './token.js';

/*
 * The web socket the mine's web page plays through (server.ts takes the connections, and only from
 * the site). A connection's first message must be `hello` with the token from the player's link. After that
 * it plays that player's run if one is going (mines-session.ts), and otherwise gets the lobby, from
 * which it can start one. One page per player: a new one takes over from the one before.
 *
 * A connection can say `watch` instead, with a watch link's token: it then only follows another
 * member's game (live.ts), and anything else it says is ignored.
 */

/** A few words on what a player is doing, for the online list, from a message sent to their page. */
function describe(message: ServerMessage): string | null {
  if (message.t === 'lobby') return 'Picking a bet';
  if (message.t !== 'state') return null;
  const { state } = message;
  switch (state.status) {
    case 'playing':
      return `${state.bet.toLocaleString('en-US')} on ${state.mines} 💣 · ${state.multiplier.toFixed(2)}x`;
    case 'boom':
      return `💣 Hit a mine (−${state.bet.toLocaleString('en-US')})`;
    default:
      return `Cashed out at ${state.multiplier.toFixed(2)}x`;
  }
}

/** The page connected for each player (playerKey). */
const connected = new Map<string, Peer>();

/** Plays the mine over a web socket just opened (server.ts has checked where it came from). */
export function serveMine(socket: WebSocket): void {
  const page: Peer = {
    send: (message: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    },
    close: () => socket.close(),
  };
  /** What the game sends through: the page, and (once it's a player's) their watchers too. */
  let peer: Peer = page;
  let player: Player | null = null;
  /** Set when this page only watches: whose game. */
  let watching: { guildId: string; userId: string } | null = null;
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

      if (watching) return;
      if (message.t === 'watch') {
        if (player !== null) return refuse(peer, 'bad_message');
        clearTimeout(hello);
        const watch = verifyWatchToken(message.token);
        if (!watch) return refuse(peer, 'bad_token');
        const target = { guildId: watch.viewer.guildId, userId: watch.targetId };
        const added = addWatcher('mines', target.guildId, target.userId, page);
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
        peer = playerJoined('mines', who.guildId, who.userId, who.name, page, (m) => describe(m as ServerMessage));
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
    if (watching) removeWatcher('mines', watching.guildId, watching.userId, page);
    if (!player) return;
    findSession(player)?.detach(peer);
    if (isCurrent()) connected.delete(playerKey(player));
    playerLeft('mines', player.guildId, player.userId, page);
  });
  socket.on('error', () => socket.terminate());
}
