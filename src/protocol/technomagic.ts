import type { ChatClientMessage, ChatServerMessage } from './chat.js';
import type { HeroPart } from './heroes.js';
import type { MainStat } from './items.js';
import type { DivineGroupId, DpFragment, ShardTier } from './divine.js';

/*
 * What the TechnoMagic Raid's web page (the Koma-UI repo) and the bot say to each other over the WebSocket. The Dragon Raid
 * (King's Raid's dragons, the raid heroes farm for gear and essences) is played the same way, on its own page and socket,
 * the page naming the dragon it wants (`hello`'s `boss`). Every message is one JSON object with a `t` saying what it is.
 * The site keeps a copy (its `yarn sync`).
 *
 * A server has as many raids (rooms others can join: the bot's web/games/technomagic/room.ts) as its players create, each
 * against a boss and with an id of its own (the front page's Find Raid lists them: LobbyView), and each player can have one of
 * their own (single player: nobody else gets in, and nothing is said in Discord). Getting ready (`prep`), everyone in it picks heroes of their own into its
 * lineup (the host up to 4, everyone else up to 3, 8 in all, even while the host is alone in it; single player, up to 7 (the Dragon Raid's, 8) against an easier boss: 4 in the Main
 * Team, whose skills are theirs to use, and the rest in the Sub Team, on Auto for the whole fight), says they're ready,
 * and the host starts the fight at a stage they have opened (won the one before it); a dragon's raid is in its Normal or Hard
 * mode, the host's pick, each mode's stages opened apart. The fight is the site's sim (its src/technomagic/sim/, the bot's vendor/technomagic-sim.mjs):
 * the bot runs it by its own clock with every player's presses, and every page runs the same one from the
 * same seed with the same presses (`fight`, then `turn` after `turn`), never going past the step the bot has
 * reached. So how it ends is the bot's word alone, and what a win gives is rolled by the bot (`over`).
 *
 * King's Raid's Divine Punishment Raid is played the same way too (its own socket, /divine), solo only, in one room of the player's
 * own (`hello` names the dungeon: `boss`, one of its bosses; `boss` changes it): a boss dungeon's lineup is 4 Main and 4 Sub, at the
 * Infinite level its opening was unlocked at (/api/divine: `stage` is that level, not picked here), with Full Shards picked to bring
 * (`divine`'s `shard`); the Karma dungeon's 3 heroes, at most one of each class, with Empty Shards picked (`empty`), and a card picked
 * after each wave (`card`). Entering checks the opening and uses up what it takes (`answer` says why not: 'not_open', 'cleared',
 * 'not_allowed', 'no_shards').
 *
 *   page -> bot   hello     first message: the token from the link (`single`: into a room of their own; `room`: into
 *                           that raid; `create`: into a new one; neither: an open raid against `boss`, or a new one)
 *                 watch     first message instead, from a watch link: follows that player's raid (getting ready, the
 *                           fight and its result, as their page is sent it, from you = them), taking no part in it
 *                 pick      puts a hero of theirs (in one of its skins) in the lineup (alone: in the Main Team or
 *                           the Sub Team; one in the other team already is moved over)
 *                 unpick    takes one of theirs out of it
 *                 ready     says they're ready (or not), anyone but the host
 *                 stage     the raid's stage (the host)
 *                 mode      the raid's mode, Normal or Hard (the host, getting ready: a dragon's), at the highest stage
 *                           the host has opened in it
 *                 begin     starts the fight (the host, with everyone ready; or `force`d, at once: who has no hero in
 *                           sits it out), getting ready or from a fight over
 *                 boss      takes the raid, everyone in it with it, against another of the raid's bosses (the host,
 *                           getting ready): each page then goes to it (`room`'s boss is another than its own)
 *                 part      leaves the raid for good, getting ready: their place and picks go at once
 *                 press     a skill of one of their heroes (its place in the lineup)
 *                 auto      one of their heroes' Auto, on or off; `auto-all`: all of theirs
 *                 give-up   ends the fight, lost (the host)
 *                 quit      leaves the fight for good (the page's Leave): they forfeit what it gives them, and their
 *                           heroes fight on with everyone else's, on Auto, while they are out of the room at
 *                           once (single player: the fight is lost, and they stay in it)
 *                 back      from a fight over to getting ready again
 *                 again     from a fight over, the same again: says they're in for the next fight, which starts by
 *                           itself once everyone is, without going back to getting ready (one with no hero in goes
 *                           back to getting ready, to pick)
 *                 parted    its run of fight `no` parted from the bot's at `second` (its checksum then wasn't the bot's)
 *                 heroes    reads their heroes again (the page's Manage closed: one may have been transcended meanwhile)
 *                 chat      says something to the room (./chat.ts)
 *   bot -> page   room      the room as it is now: whenever anything about it changes
 *                 fight     a fight has begun (or is going on, for a page that just joined): what to run it from
 *                 turn      what everyone pressed, at which step, up to the step the fight has reached
 *                 answer    why something asked of the room wasn't done
 *                 error     and the bot closes the connection
 *                 watching  (to a watcher) whose raid it follows; away: they've left it; watchers (to a player): how many watch
 */

export type ClientMessage =
  | { t: 'hello'; token: string; single?: boolean; boss?: string; room?: string; create?: boolean }
  /** Instead of hello: a watch link's token, to follow another player's raid (nothing else is taken from a watcher's page). */
  | { t: 'watch'; token: string }
  | { t: 'pick'; hero: string; skin: number; sub?: boolean }
  | { t: 'unpick'; hero: string }
  | { t: 'ready'; on: boolean }
  | { t: 'stage'; stage: number }
  | { t: 'mode'; mode: RaidMode }
  | { t: 'begin'; force?: boolean }
  | { t: 'boss'; boss: string }
  | { t: 'part' }
  | { t: 'press'; fighter: number; skill: number }
  | { t: 'auto'; fighter: number }
  | { t: 'auto-all' }
  | { t: 'give-up' }
  | { t: 'quit' }
  | { t: 'back' }
  | { t: 'again' }
  | { t: 'parted'; no: number; second: number }
  | { t: 'heroes' }
  /** The Divine Punishment Raid: a karma card picked (which of the three offered). */
  | { t: 'card'; card: 0 | 1 | 2 }
  /**
   * The Divine Punishment Raid, getting ready: another dungeon (`boss`; or `group` alone, its final boss's), and the shards to
   * bring (`shard`: Full Shards of the group into a boss dungeon; `empty`: Empty Shards into the Karma dungeon; null: none). Its
   * openings read again besides (after /api/divine's unlock).
   */
  | { t: 'divine'; group?: DivineGroupId; boss?: string; shard?: { tier: 1 | 2 | 3 | 4 | 5; count: number } | null; empty?: { tier: 2 | 3 | 4 | 5; count: number } | null }
  | ChatClientMessage;

/** Someone in the room. */
export interface PlayerView {
  id: string;
  name: string;
  avatar: string;
  /** Their place in the room (1: the host, who started it or has been in it longest). */
  number: number;
  host: boolean;
  /** Ready to fight (getting ready, the host always is); a fight over, in for the next one (`again`). */
  ready: boolean;
  /** Not on the page right now (gone during a fight: their heroes fight on, on Auto). */
  away: boolean;
  /** How many heroes they may bring, and the ids of the heroes they own. */
  limit: number;
  owned: string[];
  /** How far each of their heroes is transcended, by id (1 to 5; one not in it, not at all). None: a bot from before it said. */
  transcend?: Record<string, number>;
  /** The skin each of their heroes is in (the outfit it wears: its place among its skins), by id; one not in it, its own look (0). None: none worn, or a bot from before outfits. */
  outfits?: Record<string, number>;
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
 * DMG…"; null: none; and "+5.2% ATK"), and its main stat (a weapon's HP, an armor's P.DEF or M.DEF; null: none). And for its
 * details: its slot and the part of a hero's gear it is (null: not hero gear), its description, the class it works for (null: any) and its set's effect once a hero wears `pieces` of
 * it (null: none).
 */
export interface DropView {
  itemId: string;
  name: string;
  stars: number;
  skill: string | null;
  /** Its options, a line each (King's Raid's hero gear's: "ATK +14%"; an artifact's, what it does at R1). */
  potentials: string[];
  /** Its icon (King's Raid's: Koma-UI's public/kr/items/<icon>.webp), or null for an item with its own picture. */
  icon: string | null;
  mainStat: MainStat | null;
  slot: 'weapon' | 'armor' | 'treasure';
  part: HeroPart | null;
  description: string;
  itemClass: string | null;
  setEffect: { pieces: number; text: string } | null;
  /** The komaDust it was salvaged for as it dropped, by the player's rule (protocol/heroes.ts SalvageRule): they don't have it. Left out: it is theirs. */
  salvaged?: number;
  /** A TechnoMagic piece salvaged so: the Upgrade Stones of its class (`itemClass`) it gave too (King's Raid's). Left out: none. */
  salvagedStones?: number;
  /** The same's Boss Crystals of its set (named by its boss: King's Raid's Crystal of Galgoria). Left out: none. */
  salvagedCrystals?: { set: string; count: number };
  /** A Reclaimed TechnoMagic piece (King's Raid's: its main stat higher; its name says so, and it is never salvaged as it drops). Left out: not one. */
  reclaimed?: boolean;
}

/**
 * What a fight that is over gave each player (by id): the items found, the points paid, (the Dragon Raid's) the hero essences,
 * so many of each kind, and the komaGems, and how many stages it cleared for them for the first time (a win clears those under
 * it too; each pays komaGems once).
 */
export interface OverView {
  result: 'won' | 'lost';
  /** Which fight it was (FightStart.no), and the step it ended at: a page draws its run of it that far before showing this. */
  no: number;
  upTo: number;
  drops: Record<string, DropView[]>;
  /** The runes each found (King's Raid's: their names and icons). */
  runes?: Record<string, { id: string; name: string; icon: string; grade: number }[]>;
  points: Record<string, number>;
  essences?: Record<string, Record<string, number>>;
  gems?: Record<string, number>;
  /** The Technomagic Gear Upgrade Stones each found (a TechnoMagic Raid win from stage 7): their class, and how many. */
  stones?: Record<string, { class: string; count: number }>;
  /** The Boss Crystals each found (a TechnoMagic Raid win: its boss's, by its set). */
  crystals?: Record<string, { set: string; count: number }>;
  /** The Technomagic Experiment Reports each found (a TechnoMagic Raid win, now and then from stage 4); left out for one who found none. */
  reports?: Record<string, number>;
  firstClears?: Record<string, number>;
  /** A Divine Punishment run's: what each got (left out for one who got nothing). */
  divine?: Record<string, DivinePaid>;
}

/**
 * What a Divine Punishment run gave a player: its group's Blood of Apostle, fragments, Empty and Full Shards (by tier), Unique Gear
 * Tickets and Legendary runes (rune ids: King's Raid's Mysterious Rune: Legendary opened); a karma run's waves and gauge, and of its
 * Empty Shards brought how many filled and how many came back; a final boss's win, its opening closed and the best level after.
 */
export interface DivinePaid {
  group: DivineGroupId;
  blood?: number;
  fragments?: Partial<Record<DpFragment, number>>;
  empty?: Partial<Record<ShardTier, number>>;
  full?: Partial<Record<ShardTier, number>>;
  tickets?: number;
  runes?: string[];
  karma?: { waves: number; gauge: number };
  emptyUsed?: number;
  emptyBack?: number;
  closed?: boolean;
  best?: number;
}

/** Which raid a room is: the TechnoMagic Raid, the Dragon Raid, or the Divine Punishment Raid. */
export type RaidKind = 'technomagic' | 'dragon' | 'divine';

/**
 * Which of a boss's modes a raid is against: a dragon's Normal mode (King's Raid's Normal Dragon Raid) or its Hard mode
 * (the Hard Dragon Raid's); a boss with only the one, Hard.
 */
export type RaidMode = 'normal' | 'hard';

/** A boss as the room says it, and how many stages it has (in its Hard mode); and, a dragon, how many its Normal mode has. */
export interface BossView {
  id: string;
  name: string;
  stages: number;
  normal?: number;
  /** A Divine Punishment dungeon's group and kind (a side boss, the final boss, the Karma dungeon). */
  divine?: { group: DivineGroupId; kind: 'side' | 'final' | 'karma' };
}

/**
 * A Divine Punishment room's openings and picks, as the room last read them (/api/divine has the rest): the group's boss opening
 * (null: none open), its Karma run unlocked, the dungeon's refusal (null: it can be entered), the shards they have of the group,
 * and the shards picked to bring.
 */
export interface DivineRoomView {
  group: DivineGroupId;
  opening: { level: number; expires: string; cleared: string[] } | null;
  karma: boolean;
  refusal: 'not_open' | 'cleared' | 'not_allowed' | null;
  empty: Record<ShardTier, number>;
  full: Record<ShardTier, number>;
  shard: { tier: 1 | 2 | 3 | 4 | 5; count: number } | null;
  bring: { tier: 2 | 3 | 4 | 5; count: number } | null;
}

export interface RoomState {
  /** This page's player. */
  you: string;
  phase: 'prep' | 'fight' | 'over';
  /** The bot's sim (a page running another is to reload). */
  version: string;
  raid: RaidKind;
  boss: BossView;
  /** The raid's bosses, this room's among them (the host can take the raid against another: `boss`). */
  bosses: BossView[];
  /** The raid's id, which its link and the front page's Find Raid join it by (null: a room of one's own, single player). */
  room: string | null;
  /** Which of the boss's modes the raid is against (the host picks it: `mode`), and its stage and how many stages that mode has. */
  mode: RaidMode;
  stage: number;
  stages: number;
  /** The highest stage the host may pick: the one after the highest they have won (in the raid's mode). */
  unlocked: number;
  /** How many heroes the lineup takes now. */
  slots: number;
  /** Single player (a room of one's own): the boss is easier, and the lineup is in two teams. */
  solo: boolean;
  /** The link others join this room by (null: a room of one's own, single player). */
  link: string | null;
  players: PlayerView[];
  lineup: PickView[];
  /** The fight just over (null: none). */
  over: OverView | null;
  /** A Divine Punishment room's openings and picks (left out: another raid's room). */
  divine?: DivineRoomView;
}

/**
 * What a fight is run from: the boss, the seed, the stage, whether it is fought alone, the boss's mode (none: Hard), and each hero in it
 * (whose, which, its skin, what its gear gives it, the TechnoMagic set whose effect it has, or null, and its own
 * unique weapon's tier, 1 to 5, or null, its main unique treasure (which of its four, 1 to 4, at which tier) or null, its artifact
 * (which, at which tier) or null, the additional skill of each piece of TechnoMagic gear it wears, its transcendence perks, and, alone, whether it is in the Sub Team).
 */
export interface FightStart {
  no: number;
  boss: string;
  seed: number;
  stage: number;
  solo: boolean;
  mode?: RaidMode;
  /** A Divine Punishment run: its group, Infinite level (a boss dungeon's), side bosses cleared (a final boss's) and shards brought. */
  divine?: { group: DivineGroupId; level?: number; cleared?: readonly string[]; shard?: { tier: 1 | 2 | 3 | 4 | 5; count: number } | null; empty?: { tier: 2 | 3 | 4 | 5; count: number } | null };
  /** Each hero's `blasphemy`: per Rune of Blasphemy socketed in its gear, its class's line and rolled value (left out: none). */
  heroes: { owner: string; id: string; skin: number; gear: Record<string, number>; set: string | null; uw: number | null; ut: { skill: number; tier: number } | null; artifact: { id: string; tier: number } | null; skills: string[]; perks: string[]; sub?: boolean; blasphemy?: { skill: string; value: number }[] }[];
}

/** One press, at the step it counts before: a skill (`skill` of hero `fighter`), or a hero's Auto. */
export interface TurnInput {
  tick: number;
  kind: 'skill' | 'auto' | 'leave' | 'card';
  fighter?: number;
  skill?: number;
  /** A karma card picked (the Divine Punishment Raid's Karma dungeon). */
  card?: 0 | 1 | 2;
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
  /** Divine Punishment: no opening (or Karma run) unlocked, a side boss cleared in it already, a third dragon, too few shards. */
  | 'not_open'
  | 'cleared'
  | 'not_allowed'
  | 'no_shards'
  /** Divine Punishment's Karma dungeon: a hero of that class is in already. */
  | 'class_taken'
  /** It couldn't be done (the database didn't answer). */
  | 'failed';

/**
 * Why the bot closed the connection (`gone`: the raid asked for is over, everyone gone from it; `background`: their background
 * raids are being fought, and they can't fight in a raid's room till those are over: GET /api/tm-batches says how they go).
 */
/** (A watcher's: not_playing, the one it follows isn't in the raid; full, as many watch them as can.) */
export type ErrorCode = 'bad_token' | 'replaced' | 'bad_message' | 'full' | 'gone' | 'background' | 'not_playing';

/** A raid others can join, as the front page's Find Raid lists it (GET /api/raid-rooms). */
export interface LobbyView {
  id: string;
  boss: BossView;
  /** Its host (1P). */
  host: { name: string; avatar: string };
  mode: RaidMode;
  stage: number;
  players: number;
  /** As many as it takes. */
  most: number;
  phase: RoomState['phase'];
}

/** GET /api/raid-rooms: a server's raids against a boss, those that can be joined first. */
export interface Lobbies {
  rooms: LobbyView[];
}

export type ServerMessage =
  | { t: 'room'; state: RoomState }
  | { t: 'fight'; fight: FightStart }
  | { t: 'turn'; no: number; upTo: number; inputs: TurnInput[]; sums: [second: number, sum: number][] }
  | { t: 'answer'; to: string; code: AnswerCode }
  | { t: 'error'; code: ErrorCode }
  /** Watching (the bot's web/games/live.ts): whose raid this page follows; they left it (their page went); how many watch the player. */
  | { t: 'watching'; player: string }
  | { t: 'away' }
  | { t: 'watchers'; count: number }
  | ChatServerMessage;
