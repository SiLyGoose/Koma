// Built from Koma-UI's src/technomagic/sim/ by scripts/build-sim.mjs: don't edit it here.
export declare const SIM_VERSION = 14;
/** Seconds in a step, and the most steps a raid can take (the raid's time, and the boss's rage after it). */
export declare const STEP_SECONDS: number;
export declare const MOST_TICKS: number;
/** The most inputs a raid is taken with (more than anyone presses in its time). */
export declare const MOST_INPUTS = 20000;
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
}
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
/** A raid as the bot gave it to the pages: the boss, the seed, the stage, its heroes in order, and whether it is fought alone (the boss easier). */
export interface Run {
    boss: string;
    seed: number;
    stage: number;
    heroes: readonly RunHero[];
    solo?: boolean;
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
/** The heroes and bosses there are, by id, and how many skins each hero has. */
export declare const HERO_SKINS: Readonly<Record<string, number>>;
export declare const BOSS_IDS: readonly string[];
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
