import { divineRooms, dragonRooms, technomagicRooms } from '../games/technomagic/room.js';
/** `rooms`: each raid's rooms (the bot's own, unless a test says otherwise). */
export function raidRoomService(rooms = { technomagic: technomagicRooms, dragon: dragonRooms, divine: divineRooms }) {
    return {
        /** `guildId`'s raids of `game` against `boss`, those that can be joined first. */
        list(guildId, game, boss) {
            return { rooms: rooms[game].lobbies(guildId, boss) };
        },
    };
}
//# sourceMappingURL=raid-rooms.js.map