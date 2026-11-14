import { RAID_WEB } from '../../../constants/index.js';
import { liveRaid, watchRaids } from '../../../lib/events/raid-live.js';
import { openGameConnection, serveSocket } from '../connection.js';
import { parseClientMessage } from './protocol.js';
import { raidView } from './view.js';
/** How long a change waits for others before the page is sent the raid, so a burst of picks goes out as one. */
const BATCH_MS = 100;
/** A few words on what a player is doing, for the online list, from a message sent to their page. */
function describe(message) {
    if (message.t !== 'raid')
        return null;
    const { view } = message;
    if (view.phase === 'lobby' && view.lobby)
        return `${view.boss.name} · Lobby · ${view.lobby.players.length} in`;
    if (view.phase === 'fight' && view.fight)
        return `${view.boss.name} · Round ${view.fight.round}/${view.fight.maxRounds}`;
    return view.boss.name;
}
/** Plays the raid with the page `page`. */
export function openConnection(page, deps) {
    let player = null;
    let peer = null;
    let week = null;
    let stop = null;
    let pending = null;
    /** The live raid's phase when the week was last read: going from a fight to its end (or a new lobby) reads it again. */
    let weekPhase = null;
    const send = async () => {
        if (!player || !peer)
            return;
        const live = liveRaid(player.guildId);
        const phase = live?.phase ?? 'none';
        // The week only changes as a raid starts or ends: read it again then (and not on every pick).
        if (!week || phase !== weekPhase || phase === 'none' || phase === 'over') {
            weekPhase = phase;
            week = await deps.week(player.guildId);
        }
        const { guildId } = player;
        peer.send({ t: 'raid', view: raidView(player.userId, week, live, Date.now(), (userId) => deps.avatar?.(guildId, userId) ?? null) });
    };
    const schedule = () => {
        if (pending)
            return;
        pending = setTimeout(() => {
            pending = null;
            void send().catch((err) => console.error('Could not send a raid page the raid:', err));
        }, BATCH_MS);
    };
    const answer = (to, code) => peer?.send({ t: 'answer', to, code });
    return openGameConnection({ live: 'raid', limits: RAID_WEB, parse: parseClientMessage, describe: (m) => describe(m) }, page, {
        async hello(hello) {
            player = hello.player;
            peer = hello.join();
            stop = watchRaids(player.guildId, schedule);
            await send();
            if (hello.gone)
                stop();
        },
        async message(who, _peer, message) {
            const raid = liveRaid(who.guildId);
            const going = raid !== null && raid.phase !== 'over';
            switch (message.t) {
                case 'start': {
                    if (going)
                        return answer('start', 'started');
                    const started = await deps.start(who.guildId, who.userId, message.level ?? 1);
                    week = null;
                    answer('start', started.ok ? 'ok' : started.reason);
                    return schedule();
                }
                case 'join': {
                    if (!raid?.lobby)
                        return answer('join', raid?.phase === 'fight' ? 'closed' : 'no_raid');
                    const result = raid.lobby.join(who.userId, who.name);
                    return answer('join', result === 'joined' ? 'ok' : result === 'already_joined' || result === 'closed' ? result : 'failed');
                }
                case 'leave': {
                    if (!raid?.lobby)
                        return answer('leave', raid?.phase === 'fight' ? 'closed' : 'no_raid');
                    const result = raid.lobby.leave(who.userId);
                    return answer('leave', result === 'left' ? 'ok' : result === 'not_joined' || result === 'closed' ? result : 'failed');
                }
                case 'begin': {
                    if (!raid?.lobby)
                        return answer('begin', raid?.phase === 'fight' ? 'closed' : 'no_raid');
                    const result = raid.lobby.start(who.userId);
                    return answer('begin', result === 'started' ? 'ok' : result === 'only_host' || result === 'closed' ? result : 'failed');
                }
                case 'disband': {
                    if (!raid?.lobby)
                        return answer('disband', raid?.phase === 'fight' ? 'closed' : 'no_raid');
                    const result = raid.lobby.disband(who.userId);
                    return answer('disband', result === 'disbanded' ? 'ok' : result === 'only_host' || result === 'closed' ? result : 'failed');
                }
                case 'difficulty': {
                    if (!raid?.lobby)
                        return answer('difficulty', raid?.phase === 'fight' ? 'closed' : 'no_raid');
                    const result = raid.lobby.setDifficulty(who.userId, message.level);
                    return answer('difficulty', result === 'difficulty_set' ? 'ok' : result === 'only_host' || result === 'closed' || result === 'locked' ? result : 'failed');
                }
                case 'act': {
                    if (!raid?.fight)
                        return answer('act', 'no_raid');
                    const result = raid.fight.act(who.userId, message.action, message.target, message.skill);
                    return answer('act', result.kind === 'ok' ? 'ok' : result.kind === 'problem' ? result.problem : result.kind);
                }
            }
        },
        left() {
            stop?.();
            if (pending)
                clearTimeout(pending);
            pending = null;
        },
    });
}
/** Plays the raid over a web socket just opened (server.ts has checked where it came from). */
export function serveRaid(socket, deps) {
    serveSocket(socket, (page) => openConnection(page, deps));
}
//# sourceMappingURL=server.js.map