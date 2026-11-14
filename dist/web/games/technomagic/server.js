import { DIVINE_WEB, DRAGON_WEB, TM_WEB } from '../../../constants/index.js';
import { chatImage } from '../chat.js';
import { openGameConnection, refuse, serveSocket } from '../connection.js';
import { parseClientMessage } from './protocol.js';
import { divineRooms, dragonRooms, technomagicRooms } from './room.js';
import { runningBatch } from '../../../services/tm-batches.js';
/** A few words on what a player is doing, for the online list, from a message sent to their page. */
function describe(message) {
    if (message.t !== 'room')
        return null;
    const { phase, players, stage, boss, mode } = message.state;
    const what = phase === 'fight' ? 'Fighting' : phase === 'over' ? 'Done' : 'Getting ready';
    // (A dragon's: its mode, Normal or Hard.)
    const at = boss.normal === undefined ? `Stage ${stage}` : `${mode === 'normal' ? 'Normal' : 'Hard'} ${stage}`;
    return `${boss.name} · ${at} · ${what} · ${players.length} in`;
}
/** Whether a member's background raids are being fought (services/tm-batches.ts). */
const hasBatch = (guildId, userId) => runningBatch(guildId, userId).then((batch) => batch !== null, 
// (Not to be read: they come in, as they would have before background raids.)
() => false);
/** Plays the TechnoMagic Raid (or, its rooms the Dragon Raid's, the Dragon Raid) in `rooms` with the page `page`. */
export function openTechnoMagicConnection(page, rooms = technomagicRooms, deps = rooms.realDeps) {
    let room = null;
    const kind = rooms.raid.kind;
    return openGameConnection({ live: kind, limits: kind === 'dragon' ? DRAGON_WEB : kind === 'divine' ? DIVINE_WEB : TM_WEB, parse: parseClientMessage, describe: (m) => describe(m) }, page, {
        async hello(hello) {
            const { player, greeting } = hello;
            const peer = hello.join();
            // (The Divine Punishment Raid is solo only, as King's Raid's.)
            const single = kind === 'divine' || ('single' in greeting && greeting.single === true);
            const wanted = single ? {} : { ...('room' in greeting && greeting.room && { room: greeting.room }), ...('create' in greeting && greeting.create === true && { create: true }) };
            // The raid named is over (everyone gone from it).
            const against = rooms.bossFor(player, wanted, 'boss' in greeting ? greeting.boss : undefined);
            if (!against)
                return refuse(peer, 'gone');
            const boss = against.id;
            // Their background raids being fought: no raid's room for them till those are over.
            if (await (deps.batching ?? hasBatch)(player.guildId, player.userId))
                return refuse(peer, 'background');
            const [owned, cleared] = await Promise.all([
                deps.owned(player.guildId, player.userId).catch((err) => {
                    console.error('Could not read whose heroes are whose:', err);
                    return [];
                }),
                deps.cleared(player.guildId, player.userId, boss).catch(() => ({ hard: 0, normal: 0 })),
            ]);
            if (hello.gone)
                return;
            // (A Divine Punishment page naming no dungeon keeps the one its room is against.)
            const named = kind !== 'divine' || ('boss' in greeting && greeting.boss !== undefined);
            const joined = rooms.join(player, peer, owned, cleared, deps, single, named ? boss : undefined, wanted);
            if (!joined)
                return refuse(peer, wanted.room && !rooms.lobby(player.guildId, wanted.room) ? 'gone' : 'full');
            room = joined.room;
            if (joined.replaced)
                refuse(joined.replaced, 'replaced');
        },
        async message(player, peer, message) {
            if (!room)
                return refuse(peer, 'bad_message');
            const { userId } = player;
            const answer = (code) => {
                if (code)
                    peer.send({ t: 'answer', to: message.t, code });
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
                case 'mode':
                    return answer(room.setMode(userId, message.mode));
                case 'begin':
                    return answer(await room.begin(userId, message.force === true));
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
                case 'heroes': {
                    // (Not read: what they had stays.)
                    const owned = await deps.owned(player.guildId, player.userId).catch(() => null);
                    if (owned)
                        room.reowned(userId, owned);
                    return;
                }
                case 'card':
                    return room.card(userId, message.card);
                case 'divine':
                    return answer(await room.setDivine(userId, message));
                case 'chat':
                    return room.say(userId, message.text, await chatImage(message));
            }
        },
        watched(target, watcher) {
            rooms.watch(target.guildId, target.userId, watcher);
        },
        left(player, peer) {
            room?.leave(player.userId, peer);
        },
    });
}
/** Plays the TechnoMagic Raid over a web socket just opened. `deps` are what the bot gives it (Discord's pictures, saying a room was opened). */
export function serveTechnoMagic(socket, deps = {}) {
    const real = { ...technomagicRooms.realDeps, ...Object.fromEntries(Object.entries(deps).filter(([, fn]) => fn)) };
    serveSocket(socket, (page) => openTechnoMagicConnection(page, technomagicRooms, real));
}
/** Plays the Divine Punishment Raid over a web socket just opened (as the TechnoMagic Raid, in its rooms: each player's own). */
export function serveDivine(socket, deps = {}) {
    const real = { ...divineRooms.realDeps, ...Object.fromEntries(Object.entries(deps).filter(([, fn]) => fn)) };
    serveSocket(socket, (page) => openTechnoMagicConnection(page, divineRooms, real));
}
/** Plays the Dragon Raid over a web socket just opened (as the TechnoMagic Raid, in the dragons' rooms). */
export function serveDragon(socket, deps = {}) {
    const real = { ...dragonRooms.realDeps, ...Object.fromEntries(Object.entries(deps).filter(([, fn]) => fn)) };
    serveSocket(socket, (page) => openTechnoMagicConnection(page, dragonRooms, real));
}
//# sourceMappingURL=server.js.map