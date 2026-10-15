import type { Slot, Stars, TmSetId } from './items.js';
import type { RaidClassId } from './raid.js';

/* The TechnoMagic Raid's heroes on the site: what the bot's GET /api/heroes and the heroes page say of them. */

/**
 * Where a hero wears gear: two weapons, two armors and a treasure. The raid's gear and the TechnoMagic
 * Raid's go in them (lib/game/heroes.ts's heroWearable), each in a slot of its item's kind.
 */
export type HeroSlot = 'weapon1' | 'weapon2' | 'armor1' | 'armor2' | 'treasure';

export const HERO_SLOTS: readonly HeroSlot[] = ['weapon1', 'weapon2', 'armor1', 'armor2', 'treasure'];

/** Which kind of item goes in a hero's slot. */
export const HERO_SLOT_KIND: Readonly<Record<HeroSlot, Slot>> = { weapon1: 'weapon', weapon2: 'weapon', armor1: 'armor', armor2: 'armor', treasure: 'treasure' };

/** How far a hero can be transcended. */
export const TRANSCEND_MAX = 5;

/** The TP a hero has at each level (Transcend 0 first). */
export const TRANSCEND_TP: readonly number[] = [0, 20, 35, 50, 65, 80];

/** The TP a hero has at its most. */
export const TRANSCEND_POINTS = TRANSCEND_TP[TRANSCEND_MAX] as number;

/** The hero essences: King's Raid's seven kinds (its fragments' types), each class using three of them. */
export const ESSENCES = ['justice', 'force', 'wisdom', 'strategy', 'patience', 'harmony', 'fortune'] as const;

export type EssenceId = (typeof ESSENCES)[number];

export const ESSENCE_NAME: Readonly<Record<EssenceId, string>> = {
  justice: 'Justice',
  force: 'Force',
  wisdom: 'Wisdom',
  strategy: 'Strategy',
  patience: 'Patience',
  harmony: 'Harmony',
  fortune: 'Fortune',
};

export type TranscendTier = 1 | 2 | 3 | 5;

export interface TranscendPerk {
  id: string;
  /** Its tier: the level a hero picks it from. */
  tier: TranscendTier;
  /** What it costs in TP. */
  cost: number;
}

/** One copy a hero can wear (the raid's gear, or the TechnoMagic Raid's), as the heroes page shows it. */
export interface HeroCopy {
  id: string;
  itemId: string;
  name: string;
  stars: Stars;
  slot: Slot;
  description: string;
  level: number;
  maxLevel: number;
  masterwork: boolean;
  locked: boolean;
  /** What it does on a hero, a line for each stat it raises (for a class item, on a hero of its class): a TechnoMagic copy's potentials. */
  effects: string[];
  /**
   * TechnoMagic gear (not a treasure): its set's effect for its class, once a hero wears `pieces` of it (data/tm-sets.ts),
   * and whether it is on (the hero wearing it has its set's effect); null otherwise.
   */
  setEffect: { pieces: number; text: string; active: boolean } | null;
  /** TechnoMagic gear: the additional skill this copy came with, like "Vigor: Increases DMG…" (null: none). */
  additional: string | null;
  /** Whether its additional skill is on: a hero of its class wears it. */
  additionalActive: boolean;
  /** TechnoMagic gear: the additional skill this copy came with (the sim's id), or null. */
  skill: string | null;
  /** A class item: the one class of hero it works on (null: any). */
  class: RaidClassId | null;
  /** TechnoMagic gear or a unique weapon (which only heroes wear). */
  heroOnly: boolean;
  /** A unique weapon: the id of the one hero that wields it (null: not one). */
  uniqueWeapon: string | null;
  /** The id of the member's hero wearing it, or null. */
  hero: string | null;
}

/** One hero, as the shop and the heroes page show it. */
export interface HeroView {
  /** The site knows it by this id (its src/technomagic/ folder). */
  id: string;
  name: string;
  class: RaidClassId;
  /** What it costs in points. */
  price: number;
  owned: boolean;
  /** The copy id in each of its slots (only copies the member still owns, in a slot they fit), or null. */
  equipped: Record<HeroSlot, string | null>;
  /**
   * What its gear gives it in the raid, stat by stat, as the raid counts it: points for a chance or share
   * (crit, attack speed, penetration, block, dodge, CC resist: 1000 is 100%), and a share more of its own
   * for the rest (ATK, HP, crit damage, defence, heals, stun duration: 0.25 is 25% more), and a unique weapon's ATK
   * as it is (atkFlat).
   */
  bonus: HeroBonus;
  /** The TechnoMagic set its weapons and armors are most of: which, how many pieces, and whether its effect is on (three of them). Null with none. */
  set: { id: TmSetId; pieces: number; active: boolean } | null;
  /** The additional skills of the TechnoMagic gear it wears that work on it (the sim's ids, one for each piece). */
  skills: string[];
  /** The same as lines, like "+25% ATK" (then its set's, and its additional skills', last). */
  totals: string[];
  /** The transcendence perks picked for it (data/transcend.ts ids, in its order). */
  perks: string[];
  /** What those perks give its stats (its share too of what they give every ally), a line each, like "+30% Attack". */
  perkEffects: string[];
  /** How far it is transcended (0 to TRANSCEND_MAX), the TP it has, and what the next level costs (null: none). */
  transcend: { level: number; points: number; next: { essences: Partial<Record<EssenceId, number>>; gems: number } | null };
  /** Its three skills, then its passive. */
  abilities: HeroSkillView[];
}

/**
 * One of a hero's skills, as the heroes page says it (the raid's: Koma-UI's src/technomagic/sim/heroes/, here as
 * vendor/technomagic-sim.mjs's TM_HEROES): its name; its mana cost and cooldown (seconds; a passive has neither);
 * what its tag says besides its cost, where not its cooldown (a passive's, where not "Passive"); and King's Raid's
 * words for it, with the raid's numbers.
 */
export interface HeroSkillView {
  name: string;
  cost: number | null;
  cooldown: number | null;
  tag: string | null;
  text: string;
}

/** GET /api/heroes. */
export interface HeroesView {
  heroes: HeroView[];
  /** Every copy the member owns that a hero can wear, best first (stars, then level, then name). */
  copies: HeroCopy[];
  balance: number;
  /** Their komaGems and hero essences (each kind, 0 with none): what transcending pays with. */
  gems: number;
  essences: Record<EssenceId, number>;
}

/** Why a change to a hero's gear wasn't made (nothing changed). */
export type HeroEquipError = 'not_found' | 'not_owned' | 'wrong_slot' | 'wrong_hero' | 'one_unique' | 'busy';

/** Why a hero's transcendence perks weren't picked (nothing changed). */
export type HeroPerksError = 'not_found' | 'perk_locked' | 'too_many_points';

/** Why a hero wasn't transcended (nothing was spent). */
export type HeroTranscendError = 'not_found' | 'maxed' | 'too_poor' | 'busy';

/** Who in a server has heroes to look at (GET /api/heroes/members): the one asking first, then whoever has the most. */
export interface HeroMembers {
  members: { userId: string; name: string; avatar: string; heroes: number; you: boolean }[];
}

/**
 * Every transcendence perk, in the order the heroes page shows them: Transcend 1, everyone's; Transcend 2, its class's;
 * Transcend 3, a Light and a Dark one for each of its four skills; Transcend 5, a Light and a Dark one of its own.
 */
export const TRANSCEND_PERKS: readonly TranscendPerk[] = [
  { id: 'atk-up', tier: 1, cost: 10 },
  { id: 'hp-up', tier: 1, cost: 10 },
  { id: 'def-up', tier: 1, cost: 10 },
  { id: 'crit-resist-up', tier: 1, cost: 10 },
  { id: 'monster-hunting', tier: 1, cost: 10 },
  { id: 'class-1', tier: 2, cost: 15 },
  { id: 'class-2', tier: 2, cost: 15 },
  { id: 'class-3', tier: 2, cost: 15 },
  { id: 'class-4', tier: 2, cost: 15 },
  { id: 'class-5', tier: 2, cost: 15 },
  { id: 's1-light', tier: 3, cost: 15 },
  { id: 's1-dark', tier: 3, cost: 15 },
  { id: 's2-light', tier: 3, cost: 15 },
  { id: 's2-dark', tier: 3, cost: 15 },
  { id: 's3-light', tier: 3, cost: 15 },
  { id: 's3-dark', tier: 3, cost: 15 },
  { id: 's4-light', tier: 3, cost: 15 },
  { id: 's4-dark', tier: 3, cost: 15 },
  { id: 't5-light', tier: 5, cost: 15 },
  { id: 't5-dark', tier: 5, cost: 15 },
];

/** What gear can raise in the raid, in the order its lines are listed (the bot's lib/game/heroes.ts HERO_STATS says what each is). */
export const HERO_STAT_IDS = ['atkFlat', 'atk', 'hp', 'crit', 'critDamage', 'speed', 'pen', 'defense', 'defPhysical', 'defMagical', 'block', 'blockPhysical', 'blockMagical', 'dodge', 'resist', 'accuracy', 'lifesteal', 'critResist', 'heal', 'control', 'manaAttack', 'manaRegen'] as const;
export type HeroStat = (typeof HERO_STAT_IDS)[number];

/** What gear gives a hero: a share for each stat (0.1: 10% more, or 100 points). */
export type HeroBonus = Record<HeroStat, number>;
