import type { WebSocket } from 'ws';
import { RAID_WEB } from '../../constants/index.js';
import type { RaidWeekInfo, WebRaidStart } from '../../commands/raid.js';
import { liveRaid, watchRaids } from '../../lib/events/raid-live.js';
import { openGameConnection, serveSocket, type Connection, type Peer } from '../connection.js';
import type { Player } from '../token.js';
import { parseClientMessage, type AnswerCode, type ClientMessage, type ServerMessage } from './protocol.js';
import { raidView } from './view.js';

/*
 * The web socket the raid's page plays through (connection.ts does the greeting). Once the player
 * says hello they are sent their server's raid (view.ts) and again whenever it changes, and what
 * they press goes to the same lobby and fight as Discord's buttons (lib/events/raid-live.ts). A
 * player can have the page open more than once; each copy follows the raid.
 */

/** What the raid's socket needs from the bot (index.ts gives it the real ones). */
export interface RaidSiteDeps {
  /** Starts this week's raid in `guildId` for `userId` (commands/raid.ts's startRaidFromWeb). */
  start(guildId: string, userId: string): Promise<WebRaidStart>;
  /** How this week's raid stands in `guildId` (commands/raid.ts's raidWeekInfo). */
  week(guildId: string): Promise<RaidWeekInfo>;
}

/** How long a change waits for others before the page is sent the raid, so a burst of picks goes out as one. */
const BATCH_MS = 100;

/** A few words on what a player is doing, for the online list, from a message sent to their page. */
function describe(message: ServerMessage): string | null {
  if (message.t !== 'raid') return null;
  const { view } = message;
  if (view.phase === 'lobby' && view.lobby) return `${view.boss.name} · Lobby · ${view.lobby.players.length} in`;
  if (view.phase === 'fight' && view.fight) return `${view.boss.name} · Round ${view.fight.round}/${view.fight.maxRounds}`;
  return view.boss.name;
}

/** Plays the raid with the page `page`. */
export function openConnection(page: Peer<ServerMessage>, deps: RaidSiteDeps): Connection {
  let player: Player | null = null;
  let peer: Peer<ServerMessage> | null = null;
  let week: RaidWeekInfo | null = null;
  let stop: (() => void) | null = null;
  let pending: ReturnType<typeof setTimeout> | null = null;
  /** The live raid's phase when the week was last read: going from a fight to its end (or a new lobby) reads it again. */
  let weekPhase: string | null = null;

  const send = async (): Promise<void> => {
    if (!player || !peer) return;
    const live = liveRaid(player.guildId);
    const phase = live?.phase ?? 'none';
    // The week only changes as a raid starts or ends: read it again then (and not on every pick).
    if (!week || phase !== weekPhase || phase === 'none' || phase === 'over') {
      weekPhase = phase;
      week = await deps.week(player.guildId);
    }
    peer.send({ t: 'raid', view: raidView(player.userId, week, live) });
  };

  const schedule = (): void => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      void send().catch((err) => console.error('Could not send a raid page the raid:', err));
    }, BATCH_MS);
  };

  const answer = (to: Exclude<ClientMessage['t'], 'hello'>, code: AnswerCode): void => peer?.send({ t: 'answer', to, code });

  return openGameConnection<ClientMessage, ServerMessage>(
    { live: 'raid', limits: RAID_WEB, parse: parseClientMessage, describe: (m) => describe(m as ServerMessage) },
    page,
    {
      async hello(hello) {
        player = hello.player;
        peer = hello.join();
        stop = watchRaids(player.guildId, schedule);
        await send();
        if (hello.gone) stop();
      },

      async message(who, _peer, message) {
        const raid = liveRaid(who.guildId);
        const going = raid !== null && raid.phase !== 'over';
        switch (message.t) {
          case 'start': {
            if (going) return answer('start', 'started');
            const started = await deps.start(who.guildId, who.userId);
            week = null;
            answer('start', started.ok ? 'ok' : started.reason);
            return schedule();
          }
          case 'join': {
            if (!raid?.lobby) return answer('join', raid?.phase === 'fight' ? 'closed' : 'no_raid');
            const result = raid.lobby.join(who.userId, who.name);
            return answer('join', result === 'joined' ? 'ok' : result === 'already_joined' || result === 'closed' ? result : 'failed');
          }
          case 'leave': {
            if (!raid?.lobby) return answer('leave', raid?.phase === 'fight' ? 'closed' : 'no_raid');
            const result = raid.lobby.leave(who.userId);
            return answer('leave', result === 'left' ? 'ok' : result === 'not_joined' || result === 'closed' ? result : 'failed');
          }
          case 'begin': {
            if (!raid?.lobby) return answer('begin', raid?.phase === 'fight' ? 'closed' : 'no_raid');
            const result = raid.lobby.start(who.userId);
            return answer('begin', result === 'started' ? 'ok' : result === 'only_host' || result === 'closed' ? result : 'failed');
          }
          case 'act': {
            if (!raid?.fight) return answer('act', 'no_raid');
            const result = raid.fight.act(who.userId, message.action, message.target);
            return answer('act', result.kind === 'ok' ? 'ok' : result.kind === 'problem' ? result.problem : result.kind);
          }
        }
      },

      left() {
        stop?.();
        if (pending) clearTimeout(pending);
        pending = null;
      },
    },
  );
}

/** Plays the raid over a web socket just opened (server.ts has checked where it came from). */
export function serveRaid(socket: WebSocket, deps: RaidSiteDeps): void {
  serveSocket<ServerMessage>(socket, (page) => openConnection(page, deps));
}
