import type { Player } from '../auth/token.js';
import type { SiteGames } from '../../events/games/site-games.js';
import { REACTION_GAP_MS, type ReactClientMessage, type ReactionMessage } from '../../protocol/reactions.js';
import { openGameConnection, refuse, type Connection, type GameSocket, type Peer } from './connection.js';

/*
 * The web socket of a random event played on the site as well as in Discord, the one game (Hot Potato's and Laser
 * Grid's: web/games/potato/, web/games/laser/; the game itself is events/games/site-games.ts's). Everything about such
 * a game is public, so every page in the server is told the same game, again whenever it changes. A page whose player
 * didn't join in time watches it, and so does a watcher's page (a watch link: connection.ts mirrors the player's
 * page to it). One page per player: a new one takes over.
 *
 * There's no chat beside it, but there are reactions (../../protocol/reactions.ts): anyone's page can press one, a
 * watcher's too (marked `spectator`), and every page in the server is told it, at most one a person every
 * REACTION_GAP_MS. Nothing is kept of them.
 */

/** The messages the game itself answers: everything but the greeting and the reactions. */
type Act<Message> = Exclude<Message, { t: 'hello' } | { t: 'watch' } | ReactClientMessage>;

/** What a server's game says to its pages, and how it answers what they say. */
export interface SiteEvent<Game, End, Message extends { t: string }, Server extends { t: string }> {
  socket: GameSocket<Message>;
  games: SiteGames<Game, End>;
  /** The `state` message for `userId`'s page. */
  state(guildId: string, userId: string): Server;
  /** Answers one of a player's page's messages (null: nothing to answer). */
  act(game: Game | null, player: Player, message: Act<Message>): Server | null;
}

/** Opens the connections of one such event: returns what opens one for a page just connected. */
export function siteEventServer<Game, End, Message extends { t: string }, Server extends { t: string }>(
  event: SiteEvent<Game, End, Message, Server>,
): (page: Peer<Server>) => Connection {
  /** The page connected for each player, by server and then by player. */
  const pages = new Map<string, Map<string, Peer<Server>>>();
  /** When each member last reacted, by server and member. */
  const reacted = new Map<string, number>();

  // A server's game changed: every page there is told it again.
  event.games.onChange((guildId) => {
    for (const [userId, peer] of pages.get(guildId) ?? []) peer.send(event.state(guildId, userId));
  });

  /** `who` reacted in `guildId`: every page there is told (watchers through the page they watch), unless too soon after their last. */
  function react(guildId: string, who: Player, emoji: number, spectator: boolean): void {
    const key = `${guildId}:${who.userId}`;
    const now = Date.now();
    const last = reacted.get(key);
    if (last !== undefined && now - last < REACTION_GAP_MS) return;
    reacted.set(key, now);
    if (reacted.size > 5_000) reacted.clear();
    const message: ReactionMessage = { t: 'reaction', id: who.userId, name: who.name, emoji, ...(spectator && { spectator: true as const }) };
    for (const peer of pages.get(guildId)?.values() ?? []) peer.send(message as unknown as Server);
  }

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
        if (message.t === 'react') return react(player.guildId, player, (message as unknown as ReactClientMessage).emoji, false);
        const answer = event.act(event.games.in(player.guildId), player, message as unknown as Act<Message>);
        if (answer) peer.send(answer);
      },

      // (A watcher arriving gets the game from the player's page: live.ts keeps its last state. Of what it says, only a
      // reaction is taken.)
      async watching(target, _page, message, viewer) {
        if (message.t === 'react') react(target.guildId, viewer, (message as unknown as ReactClientMessage).emoji, true);
      },

      left(player, peer) {
        const here = pages.get(player.guildId);
        if (here?.get(player.userId) !== peer) return;
        here.delete(player.userId);
        if (here.size === 0) pages.delete(player.guildId);
      },
    });
}
