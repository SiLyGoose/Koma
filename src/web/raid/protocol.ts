import type { RaidBossId } from '../../constants/index.js';
import type { RaidAction } from '../../lib/events/raid.js';
import type { ActProblem, LobbyAnswer, RaidEnd } from '../../lib/events/raid-live.js';

/*
 * What the raid's page (the Koma-UI repo's src/raid) and the bot say to each other over the raid's
 * WebSocket. Every message is one JSON object with a `t` saying what it is. The page keeps a copy of
 * these types (src/raid/protocol.ts there): change both together.
 *
 * The raid is the server's weekly raid, the very one on its Discord message (commands/raid.ts): a
 * player on the page is in the same lobby and fight as the ones pressing buttons in Discord.
 *
 *   page -> bot   hello    first message: the token from the link
 *                 start    starts this week's raid: its lobby goes up in the server's channel, with
 *                          them as the host
 *                 join     joins the lobby; `leave` leaves it
 *                 begin    the host starts the fight now, without waiting for the lobby to close
 *                 act      their action this turn (`target`: who a heal is for, left out to let the
 *                          bot choose)
 *   bot -> page   raid     the raid as it is now: whenever anything about it changes
 *                 answer   how a start, join, leave, begin or act went (`code` is 'ok' when it went)
 *                 error    and the bot closes the connection
 *
 * Text from the raid (the boss's next move, the log) is Discord markdown, as the raid message shows
 * it: **bold**, *italics*, <@id> mentions (named in `names`), and <:name:id> custom emojis.
 */

export type ClientMessage =
  | { t: 'hello'; token: string }
  | { t: 'start' }
  | { t: 'join' }
  | { t: 'leave' }
  | { t: 'begin' }
  | { t: 'act'; action: RaidAction; target?: string };

/** The boss's pictures: calm and angrier as it loses HP, and how the fight ended. */
export type RaidMood = 'calm' | 'enraged' | 'furious' | 'shielded' | 'defeated' | 'gloating' | 'fled';

export interface RaidPlayerView {
  userId: string;
  hp: number;
  maxHp: number;
  /** Their crowd control, while it lasts. */
  cc: { effect: 'stunned' | 'disarmed' | 'taunted'; turns: number } | null;
  /** What they picked this turn (everyone sees everyone's, as in Discord). */
  picked: RaidAction | null;
  /** They can pick this turn (standing and not stunned). */
  canAct: boolean;
}

export interface RaidFightView {
  round: number;
  maxRounds: number;
  bossHp: number;
  bossMaxHp: number;
  /** 0 calm, 1 enraged, 2 furious. */
  enrage: number;
  shielded: boolean;
  /** Rounds of Support's attack boost left, and how big it is. */
  rallied: number;
  rallyMultiplier: number;
  /** What the boss does at the end of this turn (markdown). */
  intent: string;
  /** Taking picks, until `endsAt` (ms); false while the round is being resolved. */
  open: boolean;
  endsAt: number;
  players: RaidPlayerView[];
  /** The newest lines of the action log, oldest first (markdown). */
  log: string[];
  /** Why the one looking can't take each action this turn (null: they can). */
  problems: Record<RaidAction, ActProblem | null>;
}

export interface RaidOverView {
  end: RaidEnd;
  rounds: number;
  bossHp: number;
  bossMaxHp: number;
  /** Damage dealt, most first. */
  ranking: { userId: string; damage: number }[];
  /** What each raider did, in the order they joined: damage dealt, HP healed, and damage their guarding kept off the party. */
  players: { userId: string; damage: number; healed: number; mitigated: number }[];
  lastHit: string | null;
  /** The winners were paid this. */
  reward: { points: number; tokens: number; gems: number } | null;
}

export interface RaidView {
  /** The one looking. */
  you: string;
  /** Display names by user id, for the markdown's mentions and the lists. */
  names: Record<string, string>;
  /** Profile pictures by user id, when the bot knows them. */
  avatars: Record<string, string>;
  boss: { id: RaidBossId; name: string; emoji: string };
  /** The boss's picture now: its path under the bot's /api (GET). */
  picture: string;
  mood: RaidMood;
  /** When the week's raid resets (ms). */
  resetsAt: number;
  /**
   * `idle`: no raid going on. `week` is how this week's raid went ('open' when it hasn't been fought),
   * and `canStart` whether the page can start it (a server without a bot channel starts it in Discord).
   */
  phase: 'idle' | 'lobby' | 'fight' | 'over';
  idle: { week: 'open' | 'won' | 'wiped' | 'fled' | 'busy'; canStart: boolean } | null;
  lobby: { host: string; players: string[]; closesAt: number; bossHp: number } | null;
  fight: RaidFightView | null;
  over: RaidOverView | null;
}

/** What went wrong with a start, join, leave, begin or act. */
export type AnswerCode =
  | 'ok'
  | Exclude<LobbyAnswer, 'joined' | 'left' | 'started'>
  | ActProblem
  | 'late'
  | 'already'
  | 'no_raid'
  | 'no_channel'
  | 'busy'
  | 'raided'
  | 'started'
  | 'failed';

export type ServerMessage =
  | { t: 'raid'; view: RaidView }
  | { t: 'answer'; to: Exclude<ClientMessage['t'], 'hello'>; code: AnswerCode }
  | { t: 'error'; code: 'bad_token' | 'bad_message' | 'replaced' };

const ACTIONS: readonly RaidAction[] = ['attack', 'guard', 'heal', 'support'];

/** A message from a page, or null if it isn't one of the above. */
export function parseClientMessage(text: string): ClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const m = value as Record<string, unknown>;
  switch (m.t) {
    case 'hello':
      return typeof m.token === 'string' ? { t: 'hello', token: m.token } : null;
    case 'start':
    case 'join':
    case 'leave':
    case 'begin':
      return { t: m.t };
    case 'act': {
      if (typeof m.action !== 'string' || !ACTIONS.includes(m.action as RaidAction)) return null;
      if (m.target !== undefined && (typeof m.target !== 'string' || !/^\d{1,20}$/.test(m.target))) return null;
      return m.target === undefined ? { t: 'act', action: m.action as RaidAction } : { t: 'act', action: m.action as RaidAction, target: m.target };
    }
    default:
      return null;
  }
}
