import type { WebSocket } from 'ws';
import { LASER_WEB } from '../../../constants/index.js';
import { laserGames, type LaserGame } from '../../../events/games/laser-grid.js';
import { avatarUrl } from '../../auth/login.js';
import { serveSocket } from '../connection.js';
import { siteEventServer } from '../site-event.js';
import { parseClientMessage, type ClientMessage, type LaserState, type ServerMessage } from './protocol.js';

/*
 * The web socket Laser Grid's page plays through (site-event.ts does the rest: every page in the server told the same
 * game, watching). The game is run by its Discord message (events/games/laser-grid.ts); a page joins and
 * presses in the same game, its press judged by the round and phase it was showing.
 */

/** A member's profile picture in a server, when the bot knows it (set by serveLaser). */
type Avatar = (guildId: string, userId: string) => string | null;
let avatarOf: Avatar = () => null;

/** The game as `userId`'s page shows it, with the picture of everyone in it (or in the last). */
export function laserState(guildId: string, userId: string): LaserState {
  const game = laserGames.in(guildId);
  const live = game?.live() ?? null;
  const last = laserGames.last(guildId);
  const ids = live ? live.players.map((p) => p.id) : [...(last?.winners ?? []), ...(last?.caught ?? [])].map((p) => p.id);
  const avatars = Object.fromEntries(ids.map((id) => [id, avatarOf(guildId, id) ?? avatarUrl(id, null)]));
  return { you: userId, playing: game?.plays(userId) ?? false, live, last, avatars };
}

/** A few words on what a player is doing, for the online list, from a message sent to their page. */
function describe(message: ServerMessage): string | null {
  if (message.t !== 'state') return null;
  const { live, playing, you } = message.state;
  if (!live) return 'Waiting for a Laser Grid';
  if (live.phase === 'joining') return playing ? 'In the next Laser Grid' : 'Watching Laser Grid';
  if (!playing) return 'Watching Laser Grid';
  const me = live.players.find((p) => p.id === you);
  return me?.caughtFor ? `Caught in round ${me.caughtRound}` : `Round ${live.round} of ${live.rounds}`;
}

/** Opens a connection for a Laser Grid page just connected. */
export const openLaserConnection = siteEventServer<LaserGame, unknown, ClientMessage, ServerMessage>({
  socket: { live: 'laser', limits: LASER_WEB, parse: parseClientMessage, describe: (m) => describe(m as ServerMessage) },
  games: laserGames,
  state: (guildId, userId) => ({ t: 'state', state: laserState(guildId, userId) }),
  act(game, player, message) {
    if (message.t === 'join') {
      if (!game) return { t: 'answer', to: 'join', ok: false, reason: 'over' };
      const joined = game.join(player.userId, player.name);
      return joined === 'ok' ? { t: 'answer', to: 'join', ok: true } : { t: 'answer', to: 'join', ok: false, reason: joined };
    }
    if (!game) return { t: 'answer', to: 'press', result: 'notPlaying' };
    const press = game.press(player.userId, message.round, message.phase, message.slot);
    // A press that counted changes what everyone sees (who's caught shows at the round's end, but a duck's time at once).
    if (press.result === 'ducked' || press.result === 'early' || press.result === 'wrong' || press.result === 'late') laserGames.changed(player.guildId);
    return press.result === 'ducked' ? { t: 'answer', to: 'press', result: 'ducked', ms: press.ms } : { t: 'answer', to: 'press', result: press.result };
  },
});

/** Plays Laser Grid over a web socket just opened (`avatar`: each player's picture, when the bot knows it). */
export function serveLaser(socket: WebSocket, avatar?: Avatar): void {
  if (avatar) avatarOf = avatar;
  serveSocket<ServerMessage>(socket, openLaserConnection);
}
