import { parseChat, type ChatClientMessage, type ChatServerMessage } from '../chat.js';

/*
 * What the TechnoMagic Raid's web page (the Koma-UI repo) and the bot say to each other over the WebSocket.
 * Every message is one JSON object with a `t` saying what it is. The page keeps a copy of these types
 * (src/technomagic/protocol.ts there): change both together.
 *
 * A server has one room (room.ts). Getting ready (`prep`), everyone in it picks heroes of their own into its
 * lineup (the host up to 4, everyone else up to 2, 9 in all; alone, up to 8 against an easier boss), says
 * they're ready, and the host starts the fight. The fight is the site's sim (vendor/technomagic-sim.mjs):
 * the bot runs it by its own clock with every player's presses, and every page runs the same one from the
 * same seed with the same presses (`fight`, then `turn` after `turn`), never going past the step the bot has
 * reached. So how it ends is the bot's word alone, and what a win gives is rolled by the bot (`over`).
 *
 *   page -> bot   hello     first message: the token from the link
 *                 pick      puts a hero of theirs (in one of its skins) in the lineup
 *                 unpick    takes one of theirs out of it
 *                 ready     says they're ready (or not), anyone but the host
 *                 stage     the raid's stage (the host)
 *                 begin     starts the fight (the host, with everyone ready)
 *                 press     a skill of one of their heroes (its place in the lineup)
 *                 auto      one of their heroes' Auto, on or off; `auto-all`: all of theirs
 *                 give-up   ends the fight, lost (the host)
 *                 back      from a fight over to getting ready again
 *                 chat      says something to the room (web/games/chat.ts)
 *   bot -> page   room      the room as it is now: whenever anything about it changes
 *                 fight     a fight has begun (or is going on, for a page that just joined): what to run it from
 *                 turn      what everyone pressed, at which step, up to the step the fight has reached
 *                 answer    why something asked of the room wasn't done
 *                 error     and the bot closes the connection
 */

export type ClientMessage =
  | { t: 'hello'; token: string }
  | { t: 'pick'; hero: string; skin: number }
  | { t: 'unpick'; hero: string }
  | { t: 'ready'; on: boolean }
  | { t: 'stage'; stage: number }
  | { t: 'begin' }
  | { t: 'press'; fighter: number; skill: number }
  | { t: 'auto'; fighter: number }
  | { t: 'auto-all' }
  | { t: 'give-up' }
  | { t: 'back' }
  | ChatClientMessage;

/** Someone in the room. */
export interface PlayerView {
  id: string;
  name: string;
  avatar: string;
  /** Their place in the room (1: the host, who started it or has been in it longest). */
  number: number;
  host: boolean;
  /** Ready to fight (the host always is). */
  ready: boolean;
  /** Not on the page right now (gone during a fight: their heroes fight on, on Auto). */
  away: boolean;
  /** How many heroes they may bring, and the ids of the heroes they own. */
  limit: number;
  owned: string[];
}

/** A hero in the lineup: whose, which, and in which of its skins. */
export interface PickView {
  owner: string;
  hero: string;
  skin: number;
}

/** What a fight that is over gave each player (by id): the items found, and whether it was one of their runs that give gear. */
export interface OverView {
  result: 'won' | 'lost';
  drops: Record<string, { itemId: string; name: string; stars: number }[]>;
  rewarded: string[];
}

export interface RoomState {
  /** This page's player. */
  you: string;
  phase: 'prep' | 'fight' | 'over';
  /** The bot's sim (a page running another is to reload). */
  version: number;
  boss: { id: string; name: string };
  stage: number;
  stages: number;
  /** How many heroes the lineup takes now. */
  slots: number;
  /** One player alone: the boss is easier. */
  solo: boolean;
  players: PlayerView[];
  lineup: PickView[];
  /** How many more runs this player can begin today that give gear for a win. */
  rewardsLeft: number;
  /** The fight just over (null: none). */
  over: OverView | null;
}

/** What a fight is run from: the boss, the seed, the stage, whether it is fought alone, and each hero in it (whose, which, its skin and what its gear gives it). */
export interface FightStart {
  no: number;
  boss: string;
  seed: number;
  stage: number;
  solo: boolean;
  heroes: { owner: string; id: string; skin: number; gear: Record<string, number> }[];
}

/** One press, at the step it counts before: a skill (`skill` of hero `fighter`), or a hero's Auto. */
export interface TurnInput {
  tick: number;
  kind: 'skill' | 'auto' | 'leave';
  fighter?: number;
  skill?: number;
}

export type AnswerCode =
  /** Asked at the wrong time (a pick in a fight, say), or of someone who can't (only the host can). */
  | 'closed'
  | 'only_host'
  /** Picks: a hero that isn't theirs, one they have in already, no room left for theirs or at all. */
  | 'not_owned'
  | 'picked'
  | 'limit'
  | 'full'
  /** Starting: someone isn't ready, or has no hero in. */
  | 'not_ready'
  | 'no_heroes'
  /** It couldn't be done (the database didn't answer). */
  | 'failed';

export type ErrorCode = 'bad_token' | 'replaced' | 'bad_message' | 'full';

export type ServerMessage =
  | { t: 'room'; state: RoomState }
  | { t: 'fight'; fight: FightStart }
  | { t: 'turn'; no: number; upTo: number; inputs: TurnInput[]; sums: [second: number, sum: number][] }
  | { t: 'answer'; to: string; code: AnswerCode }
  | { t: 'error'; code: ErrorCode }
  | ChatServerMessage;

const id = (n: unknown): n is string => typeof n === 'string' && n.length > 0 && n.length <= 64;
const index = (n: unknown, below: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < below;

/** Reads a message from the page. Null when it isn't a valid one. */
export function parseClientMessage(text: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  switch (m.t) {
    case 'hello':
      return typeof m.token === 'string' && m.token.length <= 512 ? { t: 'hello', token: m.token } : null;
    case 'pick':
      return id(m.hero) && index(m.skin, 64) ? { t: 'pick', hero: m.hero, skin: m.skin } : null;
    case 'unpick':
      return id(m.hero) ? { t: 'unpick', hero: m.hero } : null;
    case 'ready':
      return typeof m.on === 'boolean' ? { t: 'ready', on: m.on } : null;
    case 'stage':
      return index(m.stage, 100) ? { t: 'stage', stage: m.stage } : null;
    case 'press':
      return index(m.fighter, 64) && index(m.skill, 16) ? { t: 'press', fighter: m.fighter, skill: m.skill } : null;
    case 'auto':
      return index(m.fighter, 64) ? { t: 'auto', fighter: m.fighter } : null;
    case 'begin':
    case 'auto-all':
    case 'give-up':
    case 'back':
      return { t: m.t };
    case 'chat':
      return parseChat(m);
    default:
      return null;
  }
}
