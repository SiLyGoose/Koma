import type { RaidBossId } from '../../constants/index.js';
import type { CrowdControl, RaidAction, RaidChoice, RaidState } from './raid.js';

/*
 * The raid going on in each server right now, for everything that follows it besides its Discord
 * message: the site's raid page (web/games/raid) shows it and plays in it. The lobby and the fight
 * (commands/raid.ts) put their own join, leave, start and act here, and Discord's buttons call the
 * very same ones, so a player on the site and one in Discord are in one lobby and one fight.
 *
 * No Discord or database in here. A raid stays after it ends (phase 'over'), so a page can show how
 * it went, until the next one in its server opens.
 */

/** How a press in the lobby went. */
export type LobbyAnswer = 'joined' | 'already_joined' | 'left' | 'not_joined' | 'started' | 'only_host' | 'closed';

/** Why a player can't act this turn (lib/events/raid.ts's actionProblem). */
export type ActProblem = 'not_playing' | 'knocked_out' | CrowdControl;

/** How an action for the turn went: locked in, too late, already picked, or not allowed. */
export type ActAnswer = { kind: 'ok' } | { kind: 'late' } | { kind: 'already'; action: RaidAction } | { kind: 'problem'; problem: ActProblem };

export interface RaidLobbyLive {
  /** Who is in, in the order they joined (the host first). */
  readonly players: readonly string[];
  readonly closesAt: number;
  join(userId: string, name: string): LobbyAnswer;
  leave(userId: string): LobbyAnswer;
  /** The host starts the fight early. */
  start(userId: string): LobbyAnswer;
}

export interface RaidTurnLive {
  round: number;
  /** Taking picks (false while the round is being resolved). */
  open: boolean;
  endsAt: number;
  choices: ReadonlyMap<string, RaidChoice>;
}

export interface RaidFightLive {
  readonly state: RaidState;
  /** The action log, oldest first (Discord markdown, as the raid message shows it). */
  readonly log: readonly string[];
  turn(): RaidTurnLive;
  /** Locks in `userId`'s action for this turn (`target`: who a heal is for, left out to let the bot choose). */
  act(userId: string, action: RaidAction, target?: string): ActAnswer;
}

/** How a raid ended: fought out, nobody joined, or called off part way (an error). */
export type RaidEnd = 'won' | 'wiped' | 'fled' | 'no_players' | 'called_off';

export interface RaidOverLive {
  end: RaidEnd;
  /** The fight as it ended (null when it never started). */
  state: RaidState | null;
  /** The winners were paid (a won fight the admin's test tools touched pays nothing). */
  rewarded: boolean;
}

export type RaidPhase = 'lobby' | 'fight' | 'over';

export class LiveRaid {
  phase: RaidPhase = 'lobby';
  lobby: RaidLobbyLive | null = null;
  fight: RaidFightLive | null = null;
  over: RaidOverLive | null = null;
  /** When it ended (ms), once it has. */
  endedAt: number | null = null;
  /** Each raider's gear as the fight started (web/models/gear.ts's wornGear), for the site's end screen. */
  gear = new Map<string, unknown>();

  constructor(
    readonly guildId: string,
    readonly boss: RaidBossId,
    readonly host: string,
    /** Display names seen so far (the lobby adds whoever joins). */
    readonly names: Map<string, string>,
  ) {}

  /** Something about the raid changed: tells whoever is following the server's raids. */
  changed(): void {
    for (const listener of WATCHERS.get(this.guildId) ?? []) {
      try {
        listener();
      } catch (err) {
        console.error('A raid watcher failed:', err);
      }
    }
  }

  openLobby(lobby: RaidLobbyLive): void {
    this.phase = 'lobby';
    this.lobby = lobby;
    this.changed();
  }

  openFight(fight: RaidFightLive): void {
    this.phase = 'fight';
    this.lobby = null;
    this.fight = fight;
    this.changed();
  }

  end(over: RaidOverLive): void {
    this.phase = 'over';
    this.lobby = null;
    this.fight = null;
    this.over = over;
    this.endedAt = Date.now();
    this.changed();
  }
}

const RAIDS = new Map<string, LiveRaid>();
const WATCHERS = new Map<string, Set<() => void>>();

/** Opens the raid in `guildId` (in its lobby), in place of the last one there. */
export function openLiveRaid(guildId: string, boss: RaidBossId, host: string, names: Map<string, string>): LiveRaid {
  const raid = new LiveRaid(guildId, boss, host, names);
  RAIDS.set(guildId, raid);
  return raid;
}

/** The raid in `guildId`: going on, or the last one to end. Null when there hasn't been one since the bot started. */
export const liveRaid = (guildId: string): LiveRaid | null => RAIDS.get(guildId) ?? null;

/** Calls `listener` whenever the raid in `guildId` changes, or a new one opens. Returns a function that stops it. */
export function watchRaids(guildId: string, listener: () => void): () => void {
  let set = WATCHERS.get(guildId);
  if (!set) {
    set = new Set();
    WATCHERS.set(guildId, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) WATCHERS.delete(guildId);
  };
}

/** For tests: forgets every raid and watcher. */
export function clearLiveRaids(): void {
  RAIDS.clear();
  WATCHERS.clear();
}
