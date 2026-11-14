import { MINESWEEPER_LEVEL_NAMES, MINESWEEPER_WEB } from '../../../constants/index.js';
import { chatImage } from '../chat.js';
import { openGameConnection, refuse, serveSocket } from '../connection.js';
import { parseClientMessage } from './protocol.js';
import { minesweeperRooms } from './room.js';
/** A few words on what a player is doing, for the online list, from a message sent to their page. */
function describe(message) {
    if (message.t !== 'room')
        return null;
    const { game, players } = message.state;
    return `${MINESWEEPER_LEVEL_NAMES[game.level]} · ${players.length} playing`;
}
/** Plays minesweeper in `rooms` with the page `page`. */
export function openMinesweeperConnection(page, rooms = minesweeperRooms, deps = rooms.realDeps) {
    let room = null;
    return openGameConnection({
        live: 'minesweeper',
        limits: MINESWEEPER_WEB,
        parse: parseClientMessage,
        describe: (m) => describe(m),
    }, page, {
        async hello(hello) {
            const { player } = hello;
            const peer = hello.join();
            // Their record so far (none, if it can't be read: the game goes on without it).
            const stats = await deps.stats(player.guildId, player.userId).catch((err) => {
                console.error('Could not read a minesweeper record:', err);
                return { bombs: 0, wins: 0, trolls: 0 };
            });
            if (hello.gone)
                return;
            const joined = rooms.join(player, peer, stats, deps);
            if (!joined)
                return refuse(peer, 'full');
            room = joined.room;
            if (joined.replaced)
                refuse(joined.replaced, 'replaced');
        },
        async message(player, peer, message) {
            if (!room)
                return refuse(peer, 'bad_message');
            const { userId } = player;
            if (message.t === 'new')
                room.start(userId, message.level);
            else if (message.t === 'cursor')
                room.cursor(userId, message.at);
            else if (message.t === 'chat')
                room.say(userId, message.text, await chatImage(message));
            else
                room.play(userId, message.t, message.index);
        },
        left(player, peer) {
            room?.leave(player.userId, peer);
        },
    });
}
/** Plays minesweeper over a web socket just opened. `avatar` is the member's profile picture in the server, when the bot knows it. */
export function serveMinesweeper(socket, avatar) {
    const deps = avatar ? { ...minesweeperRooms.realDeps, avatar } : minesweeperRooms.realDeps;
    serveSocket(socket, (page) => openMinesweeperConnection(page, minesweeperRooms, deps));
}
//# sourceMappingURL=server.js.map