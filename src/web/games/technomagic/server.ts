import type { WebSocket } from 'ws';
import { DRAGON_WEB, TM_WEB } from '../../../constants/index.js';
import { chatImage } from '../chat.js';
import { openGameConnection, refuse, serveSocket, type Connection } from '../connection.js';
import { parseClientMessage, type AnswerCode, type ClientMessage, type ServerMessage } from './protocol.js';
import { dragonRooms, technomagicRooms, type Peer, type RoomDeps, type TechnoMagicRoom, type TechnoMagicRooms } from './room.js';

/*
 * The web socket the TechnoMagic Raid's page plays through (connection.ts does the greeting). Once the player
 * says hello they join a raid of their server's (room.ts: the one their link names, a new one, or an open one), or a room
 * of their own (single player), with the heroes they own. One page per player: a new one takes over. It isn't watched:
 * anyone in the server can join in instead. The Dragon Raid's is the same, on a socket of its own (serveDragon), the page
 * naming the dragon it wants.
 */

export type { Peer } from './room.js';

/** A few words on what a player is doing, for the online list, from a message sent to their page. */
function describe(message: ServerMessage): string | null {
  if (message.t !== 'room') return null;
  const { phase, players, stage, boss } = message.state;
  const what = phase === 'fight' ? 'Fighting' : phase === 'over' ? 'Done' : 'Getting ready';
  return `${boss.name} · Stage ${stage} · ${what} · ${players.length} in`;
}

/** Plays the TechnoMagic Raid (or, its rooms the Dragon Raid's, the Dragon Raid) in `rooms` with the page `page`. */
export function openTechnoMagicConnection(page: Peer, rooms: TechnoMagicRooms = technomagicRooms, deps: RoomDeps = rooms.realDeps): Connection {
  let room: TechnoMagicRoom | null = null;
  const dragon = rooms.raid.kind === 'dragon';

  return openGameConnection<ClientMessage, ServerMessage>(
    { live: dragon ? 'dragon' : 'technomagic', limits: dragon ? DRAGON_WEB : TM_WEB, parse: parseClientMessage, describe: (m) => describe(m as ServerMessage) },
    page,
    {
      async hello(hello) {
        const { player, greeting } = hello;
        const peer = hello.join();
        const single = 'single' in greeting && greeting.single === true;
        const wanted = single ? {} : { ...('room' in greeting && greeting.room && { room: greeting.room }), ...('create' in greeting && greeting.create === true && { create: true }) };
        // The raid named is over (everyone gone from it).
        const against = rooms.bossFor(player, wanted, 'boss' in greeting ? greeting.boss : undefined);
        if (!against) return refuse(peer, 'gone');
        const boss = against.id;
        const [owned, cleared] = await Promise.all([
          deps.owned(player.guildId, player.userId).catch((err) => {
            console.error('Could not read whose heroes are whose:', err);
            return [] as string[];
          }),
          deps.cleared(player.guildId, player.userId, boss).catch(() => 0),
        ]);
        if (hello.gone) return;
        const joined = rooms.join(player, peer, owned, cleared, deps, single, boss, wanted);
        if (!joined) return refuse(peer, wanted.room && !rooms.lobby(player.guildId, wanted.room) ? 'gone' : 'full');
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
          case 'boss':
            return answer(await room.setBoss(userId, message.boss));
          case 'part':
            return answer(room.part(userId));
          case 'press':
            return room.press(userId, message.fighter, message.skill);
          case 'auto':
            return room.auto(userId, message.fighter);
          case 'auto-all':
            return room.autoAll(userId);
          case 'give-up':
            return answer(room.giveUp(userId));
          case 'quit':
            return answer(room.quit(userId));
          case 'back':
            return answer(room.back(userId));
          case 'again':
            return answer(await room.again(userId));
          case 'parted':
            return room.parted(userId, message.no, message.second);
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

/** Plays the Dragon Raid over a web socket just opened (as the TechnoMagic Raid, in the dragons' rooms). */
export function serveDragon(socket: WebSocket, deps: Partial<Pick<RoomDeps, 'avatar' | 'announce'>> = {}): void {
  const real = { ...dragonRooms.realDeps, ...Object.fromEntries(Object.entries(deps).filter(([, fn]) => fn)) };
  serveSocket<ServerMessage>(socket, (page) => openTechnoMagicConnection(page, dragonRooms, real));
}
