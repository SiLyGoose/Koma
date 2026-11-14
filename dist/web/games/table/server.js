import { sumBets } from '../../../lib/game/casino/table-bets.js';
import { chatImage } from '../chat.js';
import { openGameConnection, refuse, serveSocket } from '../connection.js';
import { parseTableMessage } from './protocol.js';
/*
 * The web socket a shared-table game's page (baccarat, roulette) plays through (connection.ts does
 * the greeting and watching). Once the player says hello they are seated at a shared table
 * (web/games/table/table.ts), and send their chips as they put them down. One page per player: a new one takes
 * over their seat.
 */
/** A few words on what a player is doing, for the online list, from a message sent to their page. */
function describe(message, outcome) {
    if (message.t !== 'table')
        return null;
    const { state } = message;
    const at = `Table ${state.table} · ${state.seats.length}/${state.maxSeats}`;
    const you = state.seats.find((s) => s.userId === state.you);
    if (state.phase === 'dealing' && state.round && you?.result) {
        const { net } = you.result;
        return `${at} · ${outcome(state.round)} · ${net >= 0 ? '+' : '−'}${Math.abs(net).toLocaleString('en-US')}`;
    }
    const down = you ? sumBets(you.bets) : 0;
    return down > 0 ? `${at} · ${down.toLocaleString('en-US')} down` : `${at} · Placing chips`;
}
/** Plays `tables`' game with the page `page`. */
export function openTableConnection(tables, page, deps = tables.realDeps) {
    const { game } = tables;
    let table = null;
    return openGameConnection({
        live: game.live,
        limits: game.web,
        parse: (text) => parseTableMessage(text, game.parseBets),
        describe: (m) => describe(m, game.outcome),
    }, page, {
        async hello(hello) {
            const { player } = hello;
            const peer = hello.join();
            const seated = await tables.seat(player, peer, deps);
            table = seated.table;
            if (seated.replaced)
                refuse(seated.replaced, 'replaced');
            // Gone while being seated: give the seat back.
            if (hello.gone)
                table.leave(player.userId, peer);
        },
        async message(player, peer, message) {
            if (!table)
                return refuse(peer, 'bad_message');
            // A vote to deal now (turned down quietly once the round is being dealt).
            if (message.t === 'deal') {
                table.setReady(player.userId, message.ready);
                return;
            }
            if (message.t === 'chat') {
                table.say(player.userId, message.text, await chatImage(message));
                return;
            }
            // Chips.
            const refusal = table.setBets(player.userId, message.bets);
            if (refusal) {
                peer.send({ t: 'refused', seq: message.seq, ...refusal });
                table.resend(player.userId);
            }
        },
        left(player, peer) {
            table?.leave(player.userId, peer);
        },
    });
}
/**
 * Plays `tables`' game over a web socket just opened (server.ts has checked where it came from).
 * `avatar` is the member's profile picture in the server, when the bot knows it.
 */
export function serveTable(tables, socket, avatar) {
    const deps = avatar ? { ...tables.realDeps, avatar } : tables.realDeps;
    serveSocket(socket, (page) => openTableConnection(tables, page, deps));
}
//# sourceMappingURL=server.js.map