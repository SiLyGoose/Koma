import type { WebSocket } from 'ws';
import { CLICK_GAP_MS, POTATO_WEB } from '../../../constants/index.js';
import { potatoGames, type PotatoGame } from '../../../events/games/hot-potato.js';
import { avatarUrl } from '../../auth/login.js';
import { serveSocket } from '../connection.js';
import { siteEventServer } from '../site-event.js';
import { parseClientMessage, type ClientMessage, type PotatoState, type ServerMessage } from './protocol.js';

/*
 * The web socket Hot Potato's page plays through (site-event.ts does the rest: every page in the server told the same
 * game, watching). The game is run by its Discord message (events/games/hot-potato.ts); a page joins and
 * passes in the same game.
 */

/** A member's profile picture in a server, when the bot knows it (set by servePotato). */
type Avatar = (guildId: string, userId: string) => string | null;
let avatarOf: Avatar = () => null;

/** The game as `userId`'s page shows it, with the picture of everyone in it (or in the last). */
export function potatoState(guildId: string, userId: string): PotatoState {
  const game = potatoGames.in(guildId);
  const live = game?.live() ?? null;
  const last = potatoGames.last(guildId);
  const ids = live ? live.players.map((p) => p.id) : [...(last?.winners ?? []), ...(last?.out ?? [])].map((p) => p.id);
  const avatars = Object.fromEntries(ids.map((id) => [id, avatarOf(guildId, id) ?? avatarUrl(id, null)]));
  return { you: userId, playing: game?.plays(userId) ?? false, minPlayers: 2, gapMs: CLICK_GAP_MS, live, last, avatars };
}

/** A few words on what a player is doing, for the online list, from a message sent to their page. */
function describe(message: ServerMessage): string | null {
  if (message.t !== 'state') return null;
  const { live, playing, you } = message.state;
  if (!live) return 'Waiting for a Hot Potato';
  if (live.phase === 'joining') return playing ? 'In the next Hot Potato' : 'Watching Hot Potato';
  if (!playing) return 'Watching Hot Potato';
  const me = live.players.find((p) => p.id === you);
  if (me?.out) return 'Blown up';
  return live.holder === you ? 'Holding the potato!' : `Potato ${live.blast} of ${live.blasts}`;
}

/** Opens a connection for a Hot Potato page just connected. */
export const openPotatoConnection = siteEventServer<PotatoGame, unknown, ClientMessage, ServerMessage>({
  socket: { live: 'potato', limits: POTATO_WEB, parse: parseClientMessage, describe: (m) => describe(m as ServerMessage) },
  games: potatoGames,
  state: (guildId, userId) => ({ t: 'state', state: potatoState(guildId, userId) }),
  act(game, player, message) {
    if (message.t === 'join') {
      if (!game) return { t: 'answer', to: 'join', ok: false, reason: 'over' };
      const joined = game.join(player.userId, player.name);
      return joined === 'ok' ? { t: 'answer', to: 'join', ok: true } : { t: 'answer', to: 'join', ok: false, reason: joined };
    }
    if (!game) return { t: 'answer', to: 'pass', result: 'notPlaying' };
    const press = game.pass(player.userId, message.to);
    if (press.result === 'passed') return { t: 'answer', to: 'pass', result: 'passed', name: press.name };
    if (press.result === 'grabbed') return { t: 'answer', to: 'pass', result: 'grabbed', name: press.name };
    return { t: 'answer', to: 'pass', result: press.result };
  },
});

/** Plays Hot Potato over a web socket just opened (`avatar`: each player's picture, when the bot knows it). */
export function servePotato(socket: WebSocket, avatar?: Avatar): void {
  if (avatar) avatarOf = avatar;
  serveSocket<ServerMessage>(socket, openPotatoConnection);
}
