import type { WebSocket } from 'ws';
import { addWatcher, playerJoined, playerLeft, removeWatcher, type LiveGame } from './live.js';
import { verifyToken, verifyWatchToken, type Player } from '../auth/token.js';

/*
 * What every game's web socket does before and around the game itself (mines, Pinecraft, and the
 * table games). A connection's first message must be `hello` with the token from the player's link,
 * or `watch` with a watch link's token; until then (and for at most `helloMs`) nothing else is
 * taken. A player's page is put on the online list (live.ts) once the game is ready for them; a
 * watcher's only follows another member's game, and anything it says goes to the game's `watching`
 * (or is ignored). Too many messages, or one that isn't valid, hangs up.
 */

/** Where a game's messages go: a WebSocket, or a fake one in tests. */
export interface Peer<M = unknown> {
  send(message: M): void;
  close(): void;
}

/** Tells a page why it's being hung up on, and hangs up. */
export function refuse(peer: Peer<any>, code: string): void {
  peer.send({ t: 'error', code });
  peer.close();
}

/** One connection: what it says goes to `receive`, and `closed` when it goes away. */
export interface Connection {
  receive(text: string): Promise<void>;
  closed(): void;
}

/** The first message of a connection: who it plays as, or whose game it watches. */
type Greeting = { t: 'hello'; token: string } | { t: 'watch'; token: string };

/** A player's page said hello: `join` puts them on the online list and returns the peer the game sends through (to them and their watchers). */
export interface Hello<M> {
  player: Player;
  page: Peer<M>;
  join: () => Peer<M>;
  /** The page went away while the game was getting ready. */
  readonly gone: boolean;
}

/** One connection's game. */
export interface GameHandlers<C extends { t: string }, M> {
  /** A player's page said hello: get the game ready for them, and `join` when it is. */
  hello(hello: Hello<M>): Promise<void>;
  /** Anything else a player's page says (after `join`). */
  message(player: Player, peer: Peer<M>, message: Exclude<C, Greeting>): Promise<void>;
  /** Something a watcher's page says (ignored when left out). */
  watching?(target: { guildId: string; userId: string }, page: Peer<M>, message: Exclude<C, Greeting>): Promise<void>;
  /** The page went away (the player's, whether or not they joined). */
  left?(player: Player, peer: Peer<M>): void;
}

/** What a game's socket is: its name on the site, its limits, reading and describing its messages. */
export interface GameSocket<C extends { t: string }> {
  live: LiveGame;
  limits: { readonly helloMs: number; readonly messagesPerSecond: number };
  parse: (text: string) => C | Greeting | null;
  /** A few words for the online list from a message sent to the player's page (null: no change). */
  describe: (message: unknown) => string | null;
}

/** Runs the greeting, limits and watching for `game` on `page`, and the rest through `handlers`. */
export function openGameConnection<C extends { t: string }, M>(game: GameSocket<C>, page: Peer<M>, handlers: GameHandlers<C, M>): Connection {
  /** What the game sends through: the page, and (once it's a player's) their watchers too. */
  let peer: Peer<M> = page;
  let player: Player | null = null;
  let joined = false;
  let greeted = false;
  let watching: { guildId: string; userId: string } | null = null;
  let gone = false;

  // A small budget of messages a second: far more than anyone can press keys, but not a flood.
  let budget = game.limits.messagesPerSecond;
  const refill = setInterval(() => (budget = game.limits.messagesPerSecond), 1000);
  refill.unref();
  const hello = setTimeout(() => refuse(peer, 'bad_message'), game.limits.helloMs);
  hello.unref();

  const receive = async (text: string): Promise<void> => {
    if (--budget < 0) return refuse(peer, 'bad_message');
    const message = game.parse(text);
    if (!message) return refuse(peer, 'bad_message');

    if (watching) {
      if (message.t !== 'hello' && message.t !== 'watch') await handlers.watching?.(watching, page, message as Exclude<C, Greeting>);
      return;
    }

    if (message.t === 'watch' || message.t === 'hello') {
      if (greeted) return refuse(peer, 'bad_message');
      greeted = true;
      clearTimeout(hello);
      const { token } = message as Greeting;
      if (message.t === 'watch') {
        const watch = verifyWatchToken(token);
        if (!watch) return refuse(page, 'bad_token');
        const target = { guildId: watch.viewer.guildId, userId: watch.targetId };
        const added = addWatcher(game.live, target.guildId, target.userId, page);
        if (!added.ok) return refuse(page, added.reason);
        watching = target;
        return;
      }
      const who = verifyToken(token);
      if (!who) return refuse(page, 'bad_token');
      player = who;
      await handlers.hello({
        player: who,
        page,
        join: () => {
          joined = true;
          peer = playerJoined(game.live, who.guildId, who.userId, who.name, page, game.describe) as Peer<M>;
          return peer;
        },
        get gone() {
          return gone;
        },
      });
      return;
    }

    if (!player || !joined) return refuse(peer, 'bad_message');
    await handlers.message(player, peer, message as Exclude<C, Greeting>);
  };

  const closed = (): void => {
    gone = true;
    clearInterval(refill);
    clearTimeout(hello);
    if (watching) removeWatcher(game.live, watching.guildId, watching.userId, page);
    if (!player) return;
    handlers.left?.(player, peer);
    if (joined) playerLeft(game.live, player.guildId, player.userId, page);
  };

  return { receive, closed };
}

/** A web socket as a peer: what's sent goes out as JSON while it's open. */
export function socketPeer<M>(socket: WebSocket): Peer<M> {
  return {
    send: (message) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    },
    close: () => socket.close(),
  };
}

/** Feeds a web socket just opened (server.ts has checked where it came from) to the connection `open` makes for it. */
export function serveSocket<M>(socket: WebSocket, open: (page: Peer<M>) => Connection): void {
  const page = socketPeer<M>(socket);
  const connection = open(page);
  socket.on('message', (data, isBinary) => {
    if (isBinary) return refuse(page, 'bad_message');
    void connection.receive(data.toString());
  });
  socket.on('close', () => connection.closed());
  socket.on('error', () => socket.terminate());
}
