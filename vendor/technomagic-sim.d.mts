// Built from Koma-UI's src/technomagic/sim/ by its scripts/sync.mjs: don't edit it here.
/** The sim's version: a hash of it (./version.ts), so any change to it is another (a page whose sim isn't the bot's is told to reload). */
export declare const SIM_VERSION: string;
/** Seconds in a step, and the most steps a raid can take (the raid's time, and the boss's rage after it). */
export declare const STEP_SECONDS: number;
export declare const MOST_TICKS: number;
/** The most inputs a raid is taken with (more than anyone presses in its time). */
export declare const MOST_INPUTS = 20000;
/** The most stages any boss has, in either mode (each boss's own: BossInfo.stages, and its Normal mode's: BossInfo.normal). */
export declare const MOST_STAGE: number;
/**
 * A hero in a raid: its id, the index of its skin, what its gear gives it (the bot's HeroBonus), the TechnoMagic
 * set whose effect it has (three pieces worn), or none, its own unique weapon's tier (its refinement, 1
 * to 5), or none, the additional skill of each piece of TechnoMagic gear it wears (TM_SKILLS' ids), and whether it
 * is in the Sub Team (a raid fought alone: on Auto for the whole fight).
 */
export interface RunHero {
    id: string;
    skin: number;
    gear: Readonly<Record<string, number>>;
    set?: string | null;
    uw?: number | null;
    skills?: readonly string[] | null;
    sub?: boolean;
    /** Its transcendence perks (the bot's ids). */
    perks?: readonly string[] | null;
    /** Its main unique treasure: which of its four (1 to 4: UT1 to UT4), at which tier (its refinement, 1 to 5); or none. Its sub treasures' options are in `gear`. */
    ut?: {
        skill: number;
        tier: number;
    } | null;
    /** Its artifact: which (KR_ARTIFACTS' id), at which tier (its refinement, 1 to 5); or none. */
    artifact?: {
        id: string;
        tier: number;
    } | null;
}
/**
 * What a hero's unique treasure (its `skill`th: 1 to 4, UT1 to UT4) does at a tier (1 to 5) as its main treasure, as the
 * bot says it: its name, and King's Raid's words with the fight's numbers (null: no such hero or treasure).
 */
export declare const uniqueTreasureText: (hero: string, skill: number, tier: number) => {
    name: string;
    text: string;
} | null;
/** The heroes that have a unique weapon, by id; and what one's does at a tier (1 to 5), as the bot says it: null for a hero with none. */
export declare const UNIQUE_WEAPON_HEROES: readonly string[];
export declare const uniqueWeaponText: (hero: string, tier: number) => string | null;
/** One of TechnoMagic gear's additional skills: its id, its name, its tier on the tier list (S down to F), and what it does. */
export interface TmSkill {
    id: string;
    name: string;
    tier: string;
    about: string;
}
/** Every additional skill a piece of TechnoMagic gear may come with (one, rolled as it drops: each as likely); and the most a hero has. */
export declare const TM_SKILLS: readonly TmSkill[];
export declare const MOST_TM_SKILLS: number;
/**
 * A raid as the bot gave it to the pages: the boss, the seed, the stage, its heroes in order, whether it is fought alone (the
 * boss easier), and against which of the boss's modes (a dragon's Normal mode, or its Hard; none said: Hard, the only one most have).
 */
export interface Run {
    boss: string;
    seed: number;
    stage: number;
    heroes: readonly RunHero[];
    solo?: boolean;
    mode?: BossMode;
}
/** How a raid played over went. */
export interface Replay {
    /** Won, lost, or (the inputs or the run making no sense) 'invalid'. */
    result: 'won' | 'lost' | 'invalid';
    /** Why it was invalid. */
    reason?: string;
    /** Steps it took, and the checksum at the end of each second. */
    ticks: number;
    sums: number[];
    /** The first second (from 1) whose checksum differs from the page's `sums` (null: none differs). */
    parted: number | null;
    /** What each hero's blows took of the boss, by its place in the run. */
    dealt: number[];
}
/** A hero there is (the bot sells it, and the heroes page gears it): its id, its name, its class, and how many skins it has (its own first). */
export interface TmHero {
    id: string;
    name: string;
    class: string;
    skins: number;
    /** Its three skills, then its passive: as the heroes page says them (King's Raid's words, with the fight's numbers). */
    skills: TmHeroSkill[];
    /** Its four unique treasures' names (UT1 to UT4: its skills', then its passive's). */
    treasures: string[];
}
/**
 * A hero's skill as the heroes page says it: its name; its mana cost and cooldown (seconds; a passive has neither);
 * what its tag says besides its cost, where not its cooldown (or, a passive's, where not "Passive"); and its words.
 */
export interface TmHeroSkill {
    name: string;
    cost: number | null;
    cooldown: number | null;
    tag: string | null;
    text: string;
}
/**
 * What a hero's perks (the bot's ids) give its own stats, as gear's bonus has them (shares of ATK, max HP and crit DMG;
 * chances and the like in points, 10 to 1%), and Offensive Guard's ATK from its physical defense (a share of it): for
 * its Perk Effects on the heroes page. Null: no such hero.
 */
export declare function tmPerkStats(hero: string, perks: readonly string[]): {
    bonus: Readonly<Record<string, number>>;
    atkFromDefense: number;
} | null;
/** The heroes there are, in the order of their cards; and the bosses, by id. */
export declare const TM_HEROES: readonly TmHero[];
export declare const BOSS_IDS: readonly string[];
/** Which of a boss's modes a raid is against (./bosses/boss.ts BossMode): a dragon's Normal mode, or its Hard. */
export type BossMode = 'normal' | 'hard';
/** A boss as the bot says it: its id, its name and how many stages it has (in its Hard mode); and, one with a Normal mode, how many that has. */
export interface BossInfo {
    id: string;
    name: string;
    stages: number;
    normal?: number;
}
/** The TechnoMagic Raid's bosses, and the Dragon Raid's dragons, in order. */
export declare const TM_BOSS_INFO: readonly BossInfo[];
export declare const DRAGON_INFO: readonly BossInfo[];
/** A TechnoMagic set as the fight has it: its id, name and icon, and what it does for a hero of each class wearing three of its pieces (by class; one it does nothing for left out). */
export interface TmSetInfo {
    id: string;
    name: string;
    icon: string;
    effects: Readonly<Record<string, string>>;
}
export declare const TM_SET_INFO: readonly TmSetInfo[];
/** How many of a TechnoMagic set's pieces a hero wears for its effect. */
export declare const TM_SET_PIECES: number;
/**
 * King's Raid's hero gear as the TechnoMagic Raid has it (./gear/kr-data.ts, from the CBT2 playtest's tables): the pieces,
 * their option pools, the sets' bonuses, the unique options, the runes, and how refinement raises a main stat. The bot
 * makes its items, drops and copies of them; the fight is given what they add up to (RunHero.gear, set, artifact).
 */
export type KrPart = 'weapon' | 'armor' | 'secondary' | 'accessory' | 'orb';
export type KrMainStat = 'atk' | 'hp' | 'defPhysical' | 'defMagical';
/** An option a piece may roll: its stat (a gear stat's id), the share it gives (from min to max, in `steps` steps), and how likely it is next to the others. */
export interface KrOptionData {
    stat: string;
    min: number;
    max: number;
    steps: number;
    weight: number;
}
/**
 * A piece of hero gear: its id, KR code and name, its set and tier, its part (an accessory's kind, an armor's weight), who
 * wears it (class ids), its main stat's base, its option pool and how many options it rolls, whether it has a unique option
 * (the additional skills: TM_SKILLS), its rune sockets, and its icon (Koma-UI's public/kr/items/<icon>.webp).
 */
export interface KrPieceData {
    id: string;
    code: string;
    name: string;
    set: string;
    tier: number;
    part: KrPart;
    kind?: string;
    classes: readonly string[];
    main: readonly [KrMainStat, number];
    pool: string;
    options: number;
    unique?: boolean;
    runes: number;
    icon: string;
}
/** A set's bonuses: a dragon set's 2- and 4-piece stats (both at 4: shares, by gear stat), a TechnoMagic set's 4-piece skill for each class and King's Raid's words for it. */
export interface KrSetData {
    name: string;
    two?: Readonly<Record<string, number>>;
    four: Readonly<Record<string, number>> | Readonly<Record<string, {
        skill: number;
        text: string;
    }>>;
    detail?: number;
}
/** A rune: its id, KR code and name, grade (1 Common to 6 Legendary; Ancient and Velkazar 5), colour, the parts it goes in, its stats (shares, by gear stat) and icon. */
export interface KrRuneData {
    id: string;
    code: string;
    name: string;
    grade: number;
    color: string;
    parts: readonly KrPart[];
    stats: Readonly<Record<string, number>>;
    icon: string;
    ancient?: boolean;
}
export declare const KR_PIECES: readonly KrPieceData[];
export declare const KR_POOLS: Readonly<Record<string, readonly KrOptionData[]>>;
/** A main stat's base, times its refinement's factor (R1 to R5: thousandths, at max level) for its kind of stat. */
export declare const KR_REFINE: {
    readonly atk: readonly number[];
    readonly hp: readonly number[];
    readonly def: readonly number[];
};
export declare const KR_SETS: Readonly<Record<string, KrSetData>>;
export declare const KR_RUNES: readonly KrRuneData[];
/** The TechnoMagic gear's unique options (King's Raid's 47), by number: the additional skill each is (null: none), and King's Raid's words and numbers. */
export declare const KR_UNIQUE: readonly {
    n: number;
    skill: string | null;
    text: string;
    params: readonly string[];
}[];
/** An artifact the fight has a use for (./artifacts.ts): its id, KR code and name, icon, and what it does at R1 to R5 in King's Raid's words. */
export interface TmArtifactInfo {
    id: string;
    code: string;
    name: string;
    icon: string;
    text: readonly string[];
}
export declare const TM_ARTIFACTS: readonly TmArtifactInfo[];
/** An input of the page's, as a raid takes it: a skill pressed, a hero's Auto, every hero's Auto, or leaving (with the step it came before). */
export interface RunInput {
    tick: number;
    kind: 'skill' | 'auto' | 'all-auto' | 'leave';
    fighter?: number;
    skill?: number;
}
/** The page's inputs, as they are taken (null: something in them makes no sense). Only what a raid takes. */
export declare function readInputs(raw: unknown, heroes: number): RunInput[] | null;
/** A raid being fought, step by step: what the bot runs a room's fight with (each page runs its own, with the same inputs). */
export interface LiveRaid {
    /** Steps taken so far, and how the raid ended (null: it hasn't). */
    readonly tick: number;
    readonly result: 'won' | 'lost' | null;
    /** The checksum at the end of each second so far. */
    readonly sums: readonly number[];
    /** Something a player does, counting from the next step (false: it makes no sense in a raid). */
    input(input: Omit<RunInput, 'tick'>): boolean;
    /** One step on. */
    step(): void;
    /** Whether each hero's Auto is on, and what each hero's blows have taken of the boss, by its place in the run. */
    autos(): boolean[];
    dealt(): number[];
}
/** A raid ready to be fought (a string: why the run makes no sense). */
export declare function startRaid(run: Run): LiveRaid | string;
/** Plays a raid over with the page's inputs (and, to say where it parts from the page's, its checksums). */
export declare function replay(run: Run, rawInputs: unknown, pageSums?: readonly number[]): Replay;
