import type { WebSocket } from 'ws';
import { TM_WEB } from '../../../constants/index.js';
import { chatImage } from '../chat.js';
import { openGameConnection, refuse, serveSocket, type Connection } from '../connection.js';
import { parseClientMessage, type AnswerCode, type ClientMessage, type ServerMessage } from './protocol.js';
import { technomagicRooms, type Peer, type RoomDeps, type TechnoMagicRoom, type TechnoMagicRooms } from './room.js';

/*
 * The web socket the TechnoMagic Raid's page plays through (connection.ts does the greeting). Once the player
 * says hello they join their server's room (room.ts), with the heroes they own. One page per player: a new
 * one takes over. It isn't watched: anyone in the server can join in instead.
 */

export type { Peer } from './room.js';

/** A few words on what a player is doing, for the online list, from a message sent to their page. */
function describe(message: ServerMessage): string | null {
  if (message.t !== 'room') return null;
  const { phase, players, stage } = message.state;
  const what = phase === 'fight' ? 'Fighting' : phase === 'over' ? 'Done' : 'Getting ready';
  return `Galgoria · Stage ${stage} · ${what} · ${players.length} in`;
}

/** Plays the TechnoMagic Raid in `rooms` with the page `page`. */
export function openTechnoMagicConnection(page: Peer, rooms: TechnoMagicRooms = technomagicRooms, deps: RoomDeps = rooms.realDeps): Connection {
  let room: TechnoMagicRoom | null = null;

  return openGameConnection<ClientMessage, ServerMessage>(
    { live: 'technomagic', limits: TM_WEB, parse: parseClientMessage, describe: (m) => describe(m as ServerMessage) },
    page,
    {
      async hello(hello) {
        const { player } = hello;
        const peer = hello.join();
        const [owned, left] = await Promise.all([
          deps.owned(player.guildId, player.userId).catch((err) => {
            console.error('Could not read whose heroes are whose:', err);
            return [] as string[];
          }),
          deps.rewardsLeft(player.guildId, player.userId).catch(() => 0),
        ]);
        if (hello.gone) return;
        const joined = rooms.join(player, peer, owned, left, deps);
        if (!joined) return refuse(peer, 'full');
        room = joined.room;
        if (joined.replaced) refuse(joined.replaced, 'replaced');
      },

      async message(player, peer, message) {
        if (!room) return refuse(peer, 'bad_message');
        const { userId } = player;
        const answer = (code: AnswerCode | null): void => {
          if (code) peer.send({ t: 'answer', to: message.t, code });
        };
        switch (message.t) {
          case 'pick':
            return answer(room.pick(userId, message.hero, message.skin, message.sub === true));
          case 'unpick':
            return answer(room.unpick(userId, message.hero));
          case 'ready':
            return answer(room.ready(userId, message.on));
          case 'stage':
            return answer(room.setStage(userId, message.stage));
          case 'begin':
            return answer(await room.begin(userId));
          case 'press':
            return room.press(userId, message.fighter, message.skill);
          case 'auto':
            return room.auto(userId, message.fighter);
          case 'auto-all':
            return room.autoAll(userId);
          case 'give-up':
            return answer(room.giveUp(userId));
          case 'back':
            return answer(room.back(userId));
          case 'chat':
            return room.say(userId, message.text, await chatImage(message));
        }
      },

      left(player, peer) {
        room?.leave(player.userId, peer);
      },
    },
  );
}

/** Plays the TechnoMagic Raid over a web socket just opened. `deps` are what the bot gives it (Discord's pictures, saying a room was opened). */
export function serveTechnoMagic(socket: WebSocket, deps: Partial<Pick<RoomDeps, 'avatar' | 'announce'>> = {}): void {
  const real = { ...technomagicRooms.realDeps, ...Object.fromEntries(Object.entries(deps).filter(([, fn]) => fn)) };
  serveSocket<ServerMessage>(socket, (page) => openTechnoMagicConnection(page, technomagicRooms, real));
}
