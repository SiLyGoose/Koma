import type { Player } from '../auth/token.js';
import type { SiteGames } from '../../events/games/site-games.js';
import { openGameConnection, refuse, type Connection, type GameSocket, type Peer } from './connection.js';

/*
 * The web socket of a random event played on the site as well as in Discord, the one game (Hot Potato's and Laser
 * Grid's: web/games/potato/, web/games/laser/; the game itself is events/games/site-games.ts's). Everything about such
 * a game is public, so every page in the server is told the same game, again whenever it changes. A page whose player
 * didn't join in time watches it, and so does a watcher's page (a watch link: connection.ts mirrors the player's
 * page to it). There's no chat beside it. One page per player: a new one takes over.
 */

/** What a server's game says to its pages, and how it answers what they say. */
export interface SiteEvent<Game, End, Message extends { t: string }, Server extends { t: string }> {
  socket: GameSocket<Message>;
  games: SiteGames<Game, End>;
  /** The `state` message for `userId`'s page. */
  state(guildId: string, userId: string): Server;
  /** Answers one of a player's page's messages (null: nothing to answer). */
  act(game: Game | null, player: Player, message: Exclude<Message, { t: 'hello' } | { t: 'watch' }>): Server | null;
}

/** Opens the connections of one such event: returns what opens one for a page just connected. */
export function siteEventServer<Game, End, Message extends { t: string }, Server extends { t: string }>(
  event: SiteEvent<Game, End, Message, Server>,
): (page: Peer<Server>) => Connection {
  /** The page connected for each player, by server and then by player. */
  const pages = new Map<string, Map<string, Peer<Server>>>();

  // A server's game changed: every page there is told it again.
  event.games.onChange((guildId) => {
    for (const [userId, peer] of pages.get(guildId) ?? []) peer.send(event.state(guildId, userId));
  });

  return (page) =>
    openGameConnection<Message, Server>(event.socket, page, {
      async hello(hello) {
        const { guildId, userId } = hello.player;
        const peer = hello.join();
        let here = pages.get(guildId);
        if (!here) pages.set(guildId, (here = new Map()));
        const before = here.get(userId);
        here.set(userId, peer);
        if (before) refuse(before, 'replaced');
        peer.send(event.state(guildId, userId));
      },

      async message(player, peer, message) {
        const answer = event.act(event.games.in(player.guildId), player, message as unknown as Exclude<Message, { t: 'hello' } | { t: 'watch' }>);
        if (answer) peer.send(answer);
      },

      // (A watcher arriving gets the game from the player's page: live.ts keeps its last state. It says nothing taken.)

      left(player, peer) {
        const here = pages.get(player.guildId);
        if (here?.get(player.userId) !== peer) return;
        here.delete(player.userId);
        if (here.size === 0) pages.delete(player.guildId);
      },
    });
}
