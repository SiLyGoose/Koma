import type { ChatClientMessage, ChatServerMessage } from './chat.js';

/*
 * What the TechnoMagic Raid's web page (the Koma-UI repo) and the bot say to each other over the WebSocket.
 * Every message is one JSON object with a `t` saying what it is. The site keeps a copy (its `yarn sync`).
 *
 * A server has one room (the bot's web/games/technomagic/room.ts). Getting ready (`prep`), everyone in it picks heroes of their own into its
 * lineup (the host up to 4, everyone else up to 3, 8 in all; alone, up to 7 against an easier boss: 4 in the Main
 * Team, whose skills are theirs to use, and 3 in the Sub Team, on Auto for the whole fight), says they're ready,
 * and the host starts the fight at a stage they have opened (won the one before it). The fight is the site's sim (its src/technomagic/sim/, the bot's vendor/technomagic-sim.mjs):
 * the bot runs it by its own clock with every player's presses, and every page runs the same one from the
 * same seed with the same presses (`fight`, then `turn` after `turn`), never going past the step the bot has
 * reached. So how it ends is the bot's word alone, and what a win gives is rolled by the bot (`over`).
 *
 *   page -> bot   hello     first message: the token from the link
 *                 pick      puts a hero of theirs (in one of its skins) in the lineup (alone: in the Main Team or
 *                           the Sub Team; one in the other team already is moved over)
 *                 unpick    takes one of theirs out of it
 *                 ready     says they're ready (or not), anyone but the host
 *                 stage     the raid's stage (the host)
 *                 begin     starts the fight (the host, with everyone ready)
 *                 press     a skill of one of their heroes (its place in the lineup)
 *                 auto      one of their heroes' Auto, on or off; `auto-all`: all of theirs
 *                 give-up   ends the fight, lost (the host)
 *                 back      from a fight over to getting ready again
 *                 again     from a fight over, the same again: the host's starts the next fight (once everyone else is
 *                           ready), anyone else's says they're ready for it
 *                 parted    its run of fight `no` parted from the bot's at `second` (its checksum then wasn't the bot's)
 *                 chat      says something to the room (./chat.ts)
 *   bot -> page   room      the room as it is now: whenever anything about it changes
 *                 fight     a fight has begun (or is going on, for a page that just joined): what to run it from
 *                 turn      what everyone pressed, at which step, up to the step the fight has reached
 *                 answer    why something asked of the room wasn't done
 *                 error     and the bot closes the connection
 */

export type ClientMessage =
  | { t: 'hello'; token: string }
  | { t: 'pick'; hero: string; skin: number; sub?: boolean }
  | { t: 'unpick'; hero: string }
  | { t: 'ready'; on: boolean }
  | { t: 'stage'; stage: number }
  | { t: 'begin' }
  | { t: 'press'; fighter: number; skill: number }
  | { t: 'auto'; fighter: number }
  | { t: 'auto-all' }
  | { t: 'give-up' }
  | { t: 'back' }
  | { t: 'again' }
  | { t: 'parted'; no: number; second: number }
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

/** A hero in the lineup: whose, which, in which of its skins, and (alone) whether it is in the Sub Team. */
export interface PickView {
  owner: string;
  hero: string;
  skin: number;
  sub?: boolean;
}

/**
 * An item found: which, and the additional skill and potentials its copy came with, as they are said (like "Vigor: Increases
 * DMG…"; null: none; and "+5.2% ATK"). And for its details: its slot, its description, the class it works for (null: any) and
 * its set's effect once a hero wears `pieces` of it (null: none).
 */
export interface DropView {
  itemId: string;
  name: string;
  stars: number;
  skill: string | null;
  potentials: string[];
  slot: 'weapon' | 'armor' | 'treasure';
  description: string;
  itemClass: string | null;
  setEffect: { pieces: number; text: string } | null;
}

/** What a fight that is over gave each player (by id): the items found and the points paid. */
export interface OverView {
  result: 'won' | 'lost';
  drops: Record<string, DropView[]>;
  points: Record<string, number>;
}

export interface RoomState {
  /** This page's player. */
  you: string;
  phase: 'prep' | 'fight' | 'over';
  /** The bot's sim (a page running another is to reload). */
  version: string;
  boss: { id: string; name: string };
  stage: number;
  stages: number;
  /** The highest stage the host may pick: the one after the highest they have won. */
  unlocked: number;
  /** How many heroes the lineup takes now. */
  slots: number;
  /** One player alone: the boss is easier. */
  solo: boolean;
  players: PlayerView[];
  lineup: PickView[];
  /** The fight just over (null: none). */
  over: OverView | null;
}

/**
 * What a fight is run from: the boss, the seed, the stage, whether it is fought alone, and each hero in it
 * (whose, which, its skin, what its gear gives it, the TechnoMagic set whose effect it has, or null, and its own
 * unique weapon's tier, 1 to 5, or null, the additional skill of each piece of TechnoMagic gear it wears, its transcendence perks, and, alone,
 * whether it is in the Sub Team).
 */
export interface FightStart {
  no: number;
  boss: string;
  seed: number;
  stage: number;
  solo: boolean;
  heroes: { owner: string; id: string; skin: number; gear: Record<string, number>; set: string | null; uw: number | null; skills: string[]; perks: string[]; sub?: boolean }[];
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
  /** Alone: the team picked into (Main or Sub) has no room left. */
  | 'team_full'
  /** Starting: someone isn't ready, or has no hero in. */
  | 'not_ready'
  | 'no_heroes'
  /** A stage the host hasn't opened yet (they haven't won the one before it). */
  | 'locked'
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
