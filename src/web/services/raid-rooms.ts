import type { Lobbies, RaidKind } from '../../protocol/technomagic.js';
import { dragonRooms, technomagicRooms, type TechnoMagicRooms } from '../games/technomagic/room.js';

export type { Lobbies };

/* The raids open in a server (web/games/technomagic/room.ts), for the front page's Find Raid. */

export type RaidRoomService = ReturnType<typeof raidRoomService>;

/** `rooms`: each raid's rooms (the bot's own, unless a test says otherwise). */
export function raidRoomService(rooms: Record<RaidKind, TechnoMagicRooms> = { technomagic: technomagicRooms, dragon: dragonRooms }) {
  return {
    /** `guildId`'s raids of `game` against `boss`, those that can be joined first. */
    list(guildId: string, game: RaidKind, boss: string): Lobbies {
      return { rooms: rooms[game].lobbies(guildId, boss) };
    },
  };
}
