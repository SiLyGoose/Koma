import { addWatcher, playerJoined, playerLeft, removeWatcher } from './live.js';
import { verifyToken, verifyWatchToken } from '../auth/token.js';
/** Tells a page why it's being hung up on, and hangs up. */
export function refuse(peer, code) {
    peer.send({ t: 'error', code });
    peer.close();
}
/** Runs the greeting, limits and watching for `game` on `page`, and the rest through `handlers`. */
export function openGameConnection(game, page, handlers) {
    /** What the game sends through: the page, and (once it's a player's) their watchers too. */
    let peer = page;
    let player = null;
    let joined = false;
    let greeted = false;
    let watching = null;
    let gone = false;
    // A small budget of messages a second: far more than anyone can press keys, but not a flood.
    let budget = game.limits.messagesPerSecond;
    const refill = setInterval(() => (budget = game.limits.messagesPerSecond), 1000);
    refill.unref();
    const hello = setTimeout(() => refuse(peer, 'bad_message'), game.limits.helloMs);
    hello.unref();
    const receive = async (text) => {
        if (--budget < 0)
            return refuse(peer, 'bad_message');
        const message = game.parse(text);
        if (!message)
            return refuse(peer, 'bad_message');
        if (watching) {
            if (message.t !== 'hello' && message.t !== 'watch')
                await handlers.watching?.(watching, page, message);
            return;
        }
        if (message.t === 'watch' || message.t === 'hello') {
            if (greeted)
                return refuse(peer, 'bad_message');
            greeted = true;
            clearTimeout(hello);
            const { token } = message;
            if (message.t === 'watch') {
                const watch = verifyWatchToken(token);
                if (!watch)
                    return refuse(page, 'bad_token');
                const target = { guildId: watch.viewer.guildId, userId: watch.targetId };
                const added = addWatcher(game.live, target.guildId, target.userId, page);
                if (!added.ok)
                    return refuse(page, added.reason);
                watching = target;
                handlers.watched?.(target, page);
                return;
            }
            const who = verifyToken(token);
            if (!who)
                return refuse(page, 'bad_token');
            player = who;
            await handlers.hello({
                player: who,
                greeting: message,
                page,
                join: () => {
                    joined = true;
                    peer = playerJoined(game.live, who.guildId, who.userId, who.name, page, game.describe);
                    return peer;
                },
                get gone() {
                    return gone;
                },
            });
            return;
        }
        if (!player || !joined)
            return refuse(peer, 'bad_message');
        await handlers.message(player, peer, message);
    };
    const closed = () => {
        gone = true;
        clearInterval(refill);
        clearTimeout(hello);
        if (watching)
            removeWatcher(game.live, watching.guildId, watching.userId, page);
        if (!player)
            return;
        handlers.left?.(player, peer);
        if (joined)
            playerLeft(game.live, player.guildId, player.userId, page);
    };
    return { receive, closed };
}
/** A web socket as a peer: what's sent goes out as JSON while it's open. */
export function socketPeer(socket) {
    return {
        send: (message) => {
            if (socket.readyState === socket.OPEN)
                socket.send(JSON.stringify(message));
        },
        close: () => socket.close(),
    };
}
/** Feeds a web socket just opened (server.ts has checked where it came from) to the connection `open` makes for it. */
export function serveSocket(socket, open) {
    const page = socketPeer(socket);
    const connection = open(page);
    socket.on('message', (data, isBinary) => {
        if (isBinary)
            return refuse(page, 'bad_message');
        void connection.receive(data.toString());
    });
    socket.on('close', () => connection.closed());
    socket.on('error', () => socket.terminate());
}
//# sourceMappingURL=connection.js.map