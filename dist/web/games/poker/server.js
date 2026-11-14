import { POKER_WEB } from '../../../constants/index.js';
import { chatImage } from '../chat.js';
import { openGameConnection, refuse, serveSocket } from '../connection.js';
import { parseClientMessage } from './protocol.js';
import { pokerTables } from './table.js';
/** A few words on what a player is doing, for the online list, from a message sent to their page. */
function describe(message) {
    if (message.t === 'tables')
        return 'Picking a table';
    if (message.t !== 'poker')
        return null;
    const { state } = message;
    const seated = state.seats.filter((s) => s !== null).length;
    const at = `Table ${state.table} · ${seated}/${state.seats.length}`;
    const you = state.seats.find((s) => s?.id === state.you);
    return you ? `${at} · ${you.chips.toLocaleString('en-US')} chips` : `${at} · Watching`;
}
/** Plays poker at `tables` with the page `page`. */
export function openPokerConnection(page, tables = pokerTables, deps = tables.realDeps) {
    let table = null;
    const sendTables = (player, peer) => peer.send({ t: 'tables', tables: tables.list(player.guildId) });
    /** Puts the page at table `at` (or a new one); null when it's there, why not otherwise. */
    async function enter(player, peer, at) {
        const joined = await tables.join(player, peer, at, deps);
        if ('reason' in joined)
            return joined;
        table = joined.table;
        if (joined.replaced)
            refuse(joined.replaced, 'replaced');
        return null;
    }
    return openGameConnection({
        live: 'poker',
        limits: POKER_WEB,
        // Only `hello`: a watch link would show the player's cards.
        parse: parseClientMessage,
        describe: (m) => describe(m),
    }, page, {
        async hello(hello) {
            const { player } = hello;
            const peer = hello.join();
            // Already at a table: back to it. Otherwise, the tables to pick from.
            const at = tables.tableOf(player);
            if (!at)
                return sendTables(player, peer);
            await enter(player, peer, at.number);
            // Gone while joining.
            if (hello.gone)
                await table?.leave(player.userId, peer);
        },
        async message(player, peer, message) {
            const { userId } = player;
            if (message.t === 'tables')
                return sendTables(player, peer);
            if (message.t === 'join') {
                const refusal = table ? { reason: 'not_now' } : await enter(player, peer, message.table);
                if (!refusal)
                    return;
                peer.send({ t: 'refused', ...refusal });
                return sendTables(player, peer);
            }
            if (message.t === 'leave') {
                if (!table || table.seated(userId))
                    return peer.send({ t: 'refused', reason: 'not_now' });
                const was = table;
                table = null;
                await was.leave(userId, peer);
                return sendTables(player, peer);
            }
            if (!table)
                return peer.send({ t: 'refused', reason: 'not_now' });
            if (message.t === 'chat')
                return table.say(userId, message.text, await chatImage(message));
            const refusal = message.t === 'sit'
                ? await table.sit(userId, message.chips, message.seat)
                : message.t === 'stand'
                    ? await table.stand(userId)
                    : message.t === 'act'
                        ? await table.act(userId, message.move, message.amount)
                        : message.add
                            ? await table.addBot(userId)
                            : await table.removeBot(userId, message.seat);
            if (refusal)
                peer.send({ t: 'refused', ...refusal });
        },
        left(player, peer) {
            void table?.leave(player.userId, peer);
        },
    });
}
/** Plays poker over a web socket just opened. `avatar` is the member's profile picture in the server, when the bot knows it. */
export function servePoker(socket, avatar) {
    const deps = avatar ? { ...pokerTables.realDeps, avatar } : pokerTables.realDeps;
    serveSocket(socket, (page) => openPokerConnection(page, pokerTables, deps));
}
//# sourceMappingURL=server.js.map