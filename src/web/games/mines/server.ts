import type { WebSocket } from 'ws';
import { MINE_WEB } from '../../../constants/index.js';
import { openGameConnection, refuse, serveSocket } from '../connection.js';
import { parseClientMessage, type ServerMessage } from './protocol.js';
import { findSession, lobbyFor, startWebRun, type MineSession, type Peer } from './session.js';
import { playerKey, type Player } from '../../auth/token.js';

/*
 * The web socket the mine's web page plays through (connection.ts does the greeting and watching).
 * Once the player says hello it plays their run if one is going (web/games/mines/session.ts), and otherwise
 * gets the lobby, from which it can start one. One page per player: a new one takes over from the
 * one before.
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
  serveSocket<ServerMessage>(socket, (page) => {
    /** What the game sends through: the page, and (once it's a player's) their watchers too. */
    let peer: Peer = page;
    let player: Player | null = null;
    /** The bet and mines of the last round played here, for the lobby to start from. */
    let lastBet: number | null = null;
    let lastMines: number | null = null;
    let starting = false;

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

    return openGameConnection(
      { live: 'mines', limits: MINE_WEB, parse: parseClientMessage, describe: (m) => describe(m as ServerMessage) },
      page,
      {
        async hello(hello) {
          player = hello.player;
          peer = hello.join();
          const key = playerKey(player);
          const before = connected.get(key);
          connected.set(key, peer);
          if (before) refuse(before, 'replaced');
          const session = findSession(player);
          if (session && !session.over) play(session, 0);
          else await sendLobby();
        },

        async message(who, _peer, message) {
          if (!isCurrent()) return refuse(peer, 'bad_message');
          const session = findSession(who);

          if (message.t === 'start') {
            if ((session && !session.over) || starting) return peer.send({ t: 'refused', seq: message.seq, reason: 'busy' });
            starting = true;
            try {
              const started = await startWebRun(who, message.bet, message.mines);
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
        },

        left(who) {
          findSession(who)?.detach(peer);
          if (isCurrent()) connected.delete(playerKey(who));
        },
      },
    );
  });
}
