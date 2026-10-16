/*
 * What the raid's page (the Koma-UI repo's src/raid) and the bot say to each other over the raid's
 * WebSocket. Every message is one JSON object with a `t` saying what it is. The site keeps a copy (its `yarn sync`).
 *
 * The raid is the server's raid going on, the very one on its Discord message (commands/raid.ts): a
 * player on the page is in the same lobby and fight as the ones pressing buttons in Discord.
 *
 *   page -> bot   hello    first message: the token from the link
 *                 start    starts a raid: its lobby goes up in the server's channel, with
 *                          them as the host, at the difficulty `level` they picked before it (left out: 1;
 *                          past what the server has unlocked: the hardest it has)
 *                 join     joins the lobby; `leave` leaves it
 *                 begin    the host starts the fight (nothing else does: the lobby has no countdown)
 *                 disband  the host disbands the raid before the fight, to start again
 *                 difficulty  the host picks the raid's difficulty `level` (up to the lobby's `maxDifficulty`)
 *                 act      their action this turn (`skill`: a ward in place of a Support, for a class that can; `target`: who a heal or ward is for, left out to let the
 *                          bot choose)
 *   bot -> page   raid     the raid as it is now: whenever anything about it changes
 *                 answer   how a start, join, leave, begin, disband, difficulty or act went (`code` is 'ok' when it went)
 *                 error    and the bot closes the connection
 *
 * Text from the raid (the boss's next move, the log) is Discord markdown, as the raid message shows
 * it: **bold**, *italics*, <@id> mentions (named in `names`), and <:name:id> custom emojis.
 */

/** The raid bosses (the bot's constants/raid.ts: adding one there reshuffles which one each future week gets). */
export const RAID_BOSS_IDS = ['wyrm', 'reaper', 'plague'] as const;
export type RaidBossId = (typeof RAID_BOSS_IDS)[number];

/** The raid classes (what each does in a fight is the bot's constants/raid.ts RAID_CLASSES). */
export const RAID_CLASS_IDS = ['knight', 'warrior', 'priest', 'mechanic', 'wizard', 'assassin', 'archer'] as const;
export type RaidClassId = (typeof RAID_CLASS_IDS)[number];

/** What a raider can do on their turn. */
export type RaidAction = 'attack' | 'guard' | 'heal' | 'support';

/** Stunned: can't act. Disarmed: can't attack. Taunted: can only attack. */
export type CrowdControl = 'stunned' | 'disarmed' | 'taunted';

/** Why a player can't act this turn. */
export type ActProblem = 'not_playing' | 'knocked_out' | CrowdControl;

/** How a press in the lobby went. */
export type LobbyAnswer = 'joined' | 'already_joined' | 'left' | 'not_joined' | 'started' | 'disbanded' | 'difficulty_set' | 'locked' | 'only_host' | 'closed';

/**
 * How a raid ended: fought out, its lobby emptied, disbanded before the fight (by its host, or by itself
 * after sitting idle), or called off part way (an error).
 */
export type RaidEnd = 'won' | 'wiped' | 'fled' | 'no_players' | 'disbanded' | 'called_off';

export type ClientMessage =
  | { t: 'hello'; token: string }
  | { t: 'start'; level?: number }
  | { t: 'join' }
  | { t: 'leave' }
  | { t: 'begin' }
  | { t: 'disband' }
  | { t: 'difficulty'; level: number }
  | { t: 'act'; action: RaidAction; target?: string; skill?: 'ward' };

/** The boss's pictures: calm and angrier as it loses HP, and how the fight ended. */
export type RaidMood = 'calm' | 'enraged' | 'furious' | 'shielded' | 'defeated' | 'gloating' | 'fled';

export interface RaidPlayerView {
  userId: string;
  hp: number;
  maxHp: number;
  /** Their crowd control, while it lasts. */
  cc: { effect: 'stunned' | 'disarmed' | 'taunted'; turns: number } | null;
  /** Their stacks of the Plague Matriarch's Blight (0 with none, and against the other bosses). */
  blight: number;
  /** What they picked this turn (everyone sees everyone's, as in Discord). */
  picked: RaidAction | null;
  /** They can pick this turn (standing and not stunned). */
  canAct: boolean;
  /** Their raid class for this fight (the bot's constants/raid.ts RAID_CLASS_IDS), or null with none. */
  class: string | null;
  /** Their Support can ward an ally instead (the `skill` of an act): their class's. */
  wards: boolean;
}

export interface RaidFightView {
  round: number;
  maxRounds: number;
  bossHp: number;
  bossMaxHp: number;
  /** 0 calm, 1 enraged, 2 furious. */
  enrage: number;
  shielded: boolean;
  /** Attacks the shield still deflects before it shatters (the wyrm's); 0 for a shield that is up for the turn. */
  deflects: number;
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

/** A raid item the one looking found for winning the raid. `isNew`: their first copy (left out when that isn't known). */
export interface RaidLootItem {
  itemId: string;
  name: string;
  stars: number;
  slot: 'weapon' | 'armor' | 'treasure';
  isNew?: boolean;
}

/**
 * One difficulty level: what it multiplies the boss's HP and damage by, and what a win at it drops for each
 * raider (best tier first). The boss has more HP for every raider besides: `wall` (0 to 1) of its own amount
 * (`gearHp` in the pick and lobby views, DatabankBoss.hp.gear in the databank), none at level 1 and all of it
 * from the first `gear` level, the ones built for parties in raid gear.
 */
export interface RaidLevel {
  level: number;
  hp: number;
  damage: number;
  gear: boolean;
  wall: number;
  drops: { stars: number; count: number }[];
}

/** The difficulties whoever starts the week's raid can pick from, before its lobby is up. */
export interface RaidPickView {
  /** The hardest level the server can pick (one past the hardest it has beaten), and the hardest there is. */
  maxDifficulty: number;
  topDifficulty: number;
  /** Every level, from 1 to `topDifficulty`. */
  levels: RaidLevel[];
  /** The HP this boss has on top for every raider at the levels that need gear (RaidLevel.gear); RaidLevel.wall of it below them. */
  gearHp: number;
}

/** The lobby's difficulty: the host picks a level, up to the hardest the server has unlocked. */
export interface RaidLobbyView {
  host: string;
  players: string[];
  /** The boss's HP with the party as it is now, at the difficulty picked. */
  bossHp: number;
  difficulty: number;
  /** The hardest level the server can pick (one past the hardest it has beaten), and the hardest there is. */
  maxDifficulty: number;
  topDifficulty: number;
  /** Every level, from 1 to `topDifficulty`. */
  levels: RaidLevel[];
  /** The HP this boss has on top for every raider at the levels that need gear (RaidLevel.gear), RaidLevel.wall of it below them; `bossHp` has it in. */
  gearHp: number;
}

export interface RaidOverView {
  end: RaidEnd;
  rounds: number;
  /** The boss's HP when it ended (null for this week's raid read back from the database, which doesn't keep it). */
  bossHp: number | null;
  bossMaxHp: number | null;
  /** Damage dealt, most first. */
  ranking: { userId: string; damage: number }[];
  /**
   * What each raider did, in the order they joined: damage dealt, HP healed, and damage their guarding
   * kept off the party; and for the end screen's More stats, what they healed themselves and the rest of
   * the party, the damage their rallies added, and the damage the boss did them (left out by a bot from before them).
   */
  players: { userId: string; damage: number; healed: number; mitigated: number; healedSelf?: number; healedAllies?: number; supportDamage?: number; damageTaken?: number }[];
  lastHit: string | null;
  /** The winners were paid this. */
  reward: { points: number; tokens: number; gems: number } | null;
  /** The same, in markdown with the currencies' emojis ("**1,000** <:zeiucoin:…>, **10** <:zeiutoken:…> and **5** <:komagem:…>"). */
  rewardText?: string | null;
  /** Each raider's gear as they fought can be looked at (GET /api/raid/gear?user=…): raids from before it was kept can't. */
  gear?: boolean;
  /**
   * The raid items the one looking found (best first), when they found any: the page shows them once,
   * over the end screen, until they close it. `key` names this win's, so it isn't shown again.
   */
  loot?: { key: string; items: RaidLootItem[] } | null;
}

export interface RaidView {
  /** The one looking. */
  you: string;
  /** Display names by user id, for the markdown's mentions and the lists. */
  names: Record<string, string>;
  /** Profile pictures by user id, when the bot knows them. */
  avatars: Record<string, string>;
  boss: { id: RaidBossId; name: string; emoji: string };
  /** What the boss does, in markdown: its phases, its moves, and the rewards for beating it. */
  brief: { phases: string[]; moves: string[]; rewards: string };
  /**
   * The raid drops (0 to 1): the party's chance of them when it wins, and how much each raider adds
   * (capped at 1). Null when they're off.
   */
  drops: { chance: number; perRaider: number } | null;
  /** The raid's difficulty level (1 with no raid going on and none fought this week). */
  difficulty: number;
  /** The boss's picture now: its path under the bot's /api (GET). */
  picture: string;
  mood: RaidMood;
  /** When the week's boss changes (ms). */
  resetsAt: number;
  /**
   * `idle`: no raid going on. `week` is 'open' when a raid can be started and 'busy' while one is starting
   * in Discord ('won', 'wiped' and 'fled' are from when a week had one raid, and no longer sent), and
   * `canStart` whether the page can start it (a server without a bot channel starts it in Discord);
   * `pick`, with it, is the difficulties to start it at.
   * `last` says how the last lobby went when it never came to a fight, a little while after (everyone
   * left it, it was disbanded, or it was called off), so another can be started.
   */
  phase: 'idle' | 'lobby' | 'fight' | 'over';
  idle: { week: 'open' | 'won' | 'wiped' | 'fled' | 'busy'; canStart: boolean; last?: 'no_players' | 'disbanded' | 'called_off'; pick?: RaidPickView } | null;
  lobby: RaidLobbyView | null;
  fight: RaidFightView | null;
  over: RaidOverView | null;
}

/** What went wrong with a start, join, leave, begin, disband, difficulty or act. */
export type AnswerCode =
  | 'ok'
  | Exclude<LobbyAnswer, 'joined' | 'left' | 'started' | 'disbanded' | 'difficulty_set'>
  | ActProblem
  | 'late'
  | 'already'
  | 'no_raid'
  | 'no_channel'
  | 'busy'
  | 'raided'
  | 'started'
  | 'failed';

export type ErrorCode =
  /** The link's token is wrong or too old (or the bot restarted since). */
  | 'bad_token'
  /** A message that isn't one of the above, or too many of them. */
  | 'bad_message'
  /** The page was opened somewhere else (another tab): only one plays at a time. */
  | 'replaced';

export type ServerMessage =
  | { t: 'raid'; view: RaidView }
  | { t: 'answer'; to: Exclude<ClientMessage['t'], 'hello'>; code: AnswerCode }
  | { t: 'error'; code: ErrorCode };
