import { REACTION_GAP_MS } from '../../protocol/reactions.js';
import { openGameConnection, refuse } from './connection.js';
/** Opens the connections of one such event: returns what opens one for a page just connected. */
export function siteEventServer(event) {
    /** The page connected for each player, by server and then by player. */
    const pages = new Map();
    /** When each member last reacted, by server and member. */
    const reacted = new Map();
    // A server's game changed: every page there is told it again.
    event.games.onChange((guildId) => {
        for (const [userId, peer] of pages.get(guildId) ?? [])
            peer.send(event.state(guildId, userId));
    });
    /** `who` reacted in `guildId`: every page there is told (watchers through the page they watch), unless too soon after their last. */
    function react(guildId, who, emoji, spectator) {
        const key = `${guildId}:${who.userId}`;
        const now = Date.now();
        const last = reacted.get(key);
        if (last !== undefined && now - last < REACTION_GAP_MS)
            return;
        reacted.set(key, now);
        if (reacted.size > 5_000)
            reacted.clear();
        const message = { t: 'reaction', id: who.userId, name: who.name, emoji, ...(spectator && { spectator: true }) };
        for (const peer of pages.get(guildId)?.values() ?? [])
            peer.send(message);
    }
    return (page) => openGameConnection(event.socket, page, {
        async hello(hello) {
            const { guildId, userId } = hello.player;
            const peer = hello.join();
            let here = pages.get(guildId);
            if (!here)
                pages.set(guildId, (here = new Map()));
            const before = here.get(userId);
            here.set(userId, peer);
            if (before)
                refuse(before, 'replaced');
            peer.send(event.state(guildId, userId));
        },
        async message(player, peer, message) {
            if (message.t === 'react')
                return react(player.guildId, player, message.emoji, false);
            const answer = event.act(event.games.in(player.guildId), player, message);
            if (answer)
                peer.send(answer);
        },
        // (A watcher arriving gets the game from the player's page: live.ts keeps its last state. Of what it says, only a
        // reaction is taken.)
        async watching(target, _page, message, viewer) {
            if (message.t === 'react')
                react(target.guildId, viewer, message.emoji, true);
        },
        left(player, peer) {
            const here = pages.get(player.guildId);
            if (here?.get(player.userId) !== peer)
                return;
            here.delete(player.userId);
            if (here.size === 0)
                pages.delete(player.guildId);
        },
    });
}
//# sourceMappingURL=site-event.js.map