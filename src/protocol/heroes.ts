import type { MainStat, Slot, Stars, TmSetId } from './items.js';
import type { GearRefine, GearSale, RefineBlock } from './gear.js';
import type { RaidClassId } from './raid.js';

/* The TechnoMagic Raid's heroes on the site: what the bot's GET /api/heroes and the heroes page say of them. */

/**
 * Where a hero wears gear, as King's Raid's: its Weapon (its own unique weapon, or a dragon set's weapon), Armor, Mantle,
 * Accessory and Orb (King's Raid's hero gear: the bot's data/kr-gear.ts), its Treasure (its main treasure) with three
 * sub treasure slots beside it (side1 to side3), and its Artifact. Only hero gear goes in them (lib/game/heroes.ts's
 * heroWearable: never the members' own), each in the slot of its part; a sub treasure slot only takes the hero's own unique
 * treasures, and only while its main treasure is one too (only a unique treasure has sub treasures); of one there only its
 * options count (its HP and effect are a main treasure's alone).
 */
export type HeroSlot = 'weapon' | 'armor' | 'secondary' | 'accessory' | 'orb' | 'treasure' | 'side1' | 'side2' | 'side3' | 'artifact';

export const HERO_SLOTS: readonly HeroSlot[] = ['weapon', 'armor', 'secondary', 'accessory', 'orb', 'treasure', 'side1', 'side2', 'side3', 'artifact'];

/** A hero's sub treasure slots: only its own unique treasures go in them. */
export const SIDE_SLOTS: readonly HeroSlot[] = ['side1', 'side2', 'side3'];

/** The part of a hero's gear a piece is (King's Raid's), which says the slot it goes in. */
export type HeroPart = 'weapon' | 'armor' | 'secondary' | 'accessory' | 'orb' | 'treasure' | 'artifact';

export const HERO_PARTS: readonly HeroPart[] = ['weapon', 'armor', 'secondary', 'accessory', 'orb', 'treasure', 'artifact'];

/** Which part goes in each of a hero's slots. */
export const HERO_SLOT_PART: Readonly<Record<HeroSlot, HeroPart>> = {
  weapon: 'weapon',
  armor: 'armor',
  secondary: 'secondary',
  accessory: 'accessory',
  orb: 'orb',
  treasure: 'treasure',
  side1: 'treasure',
  side2: 'treasure',
  side3: 'treasure',
  artifact: 'artifact',
};

/** Each part's name, as King's Raid's (its Secondary Gear here is the Mantle: shields, hats, capes, gloves… M.DEF). */
export const HERO_PART_NAME: Readonly<Record<HeroPart, string>> = {
  weapon: 'Weapon',
  armor: 'Armor',
  secondary: 'Mantle',
  accessory: 'Accessory',
  orb: 'Orb',
  treasure: 'Treasure',
  artifact: 'Artifact',
};

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

/** A rune, as the heroes page shows it: its id, name, grade (1 Common to 6 Legendary), colour, icon, and what it gives, a line each. */
export interface HeroRune {
  id: string;
  name: string;
  grade: number;
  color: string;
  icon: string;
  lines: string[];
}

/** A rune the member has (not socketed), how many, and the parts it goes in. */
export type HeroRuneStack = HeroRune & { count: number; parts: HeroPart[] };

/**
 * One of a copy's options (a unique treasure's: its potentials): its stat, its line ("ATK +14%"), its step of `steps` (an upgrade
 * rolls one's again), and what rerolling it costs (a unique treasure's: 0, never rerolled).
 */
export interface HeroOption {
  stat: string;
  line: string;
  step: number;
  steps: number;
  price: number;
}

/** One copy a hero can wear (King's Raid's hero gear, a unique weapon or treasure, an artifact), as the heroes page shows it. */
export interface HeroCopy {
  id: string;
  itemId: string;
  name: string;
  stars: Stars;
  slot: Slot;
  description: string;
  level: number;
  /** Its top refinement level (R5; 1 for the old TechnoMagic gear, never refined). */
  maxLevel: number;
  /** The part of a hero's gear it is (the slot it goes in), and its kind: an accessory's (ring, earrings…), an armor's weight. */
  part: HeroPart;
  kind: string | null;
  /** King's Raid's hero gear: its set (its id and name) and tier; null: none. */
  krSet: { id: string; name: string; tier: number } | null;
  /** The classes of hero it works on (empty: any). */
  classes: RaidClassId[];
  /** Its icon (King's Raid's: Koma-UI's public/kr/items/<icon>.webp), or null for gear with its own picture. */
  icon: string | null;
  /** Its options (King's Raid's random options), in order. */
  options: HeroOption[];
  /** Its rune sockets, each the rune in it (null: empty); none for a part with no sockets. */
  runes: (HeroRune | null)[];
  /**
   * What rerolling one of its options costs (POST /api/heroes/reroll; zeiucoins), its unique option (TechnoMagic gear's
   * additional skill; komaGems), and upgrading an option (POST /api/heroes/upgrade with its `option`: its amount rolled
   * again, anywhere from its least to its most; zeiucoins); null where it can't be.
   */
  reroll: number | null;
  rerollUnique: number | null;
  upgrade: number | null;
  /** Its set's bonuses: what each number of its pieces worn gives, and whether that is on (the hero wearing it has as many). */
  setBonuses: { pieces: number; text: string; active: boolean }[];
  /** Locked by the member (POST /api/heroes/lock, as the gear page's): never sold or used up by a refine. */
  locked: boolean;
  /** What selling it pays (POST /api/heroes/sell, as the gear page's): null when it's worn, saved in a loadout, on a hero or locked, so never sold. */
  sell: number | null;
  /** Hero gear: the komaDust salvaging it gives (POST /api/heroes/sell with `salvage`), whenever it can be sold; left out: it can't be salvaged (raid items, which heroes wear too). */
  salvage?: number;
  /** What selling it pays though it's locked (POST /api/heroes/sell with `locked`): null when it isn't locked, or is worn, saved in a loadout or on a hero. */
  sellLocked: number | null;
  /** What it does on a hero, a line for each stat it raises (for a class item, on a hero of its class): a TechnoMagic copy's potentials. */
  effects: string[];
  /** TechnoMagic gear: its main stat (a weapon's HP, an armor's P.DEF or M.DEF), on a hero of its class; null: none (a treasure, anything else). */
  mainStat: MainStat | null;
  /**
   * TechnoMagic gear (not a treasure): its set's effect for its class, once a hero wears `pieces` of it (data/tm-sets.ts),
   * and whether it is on (the hero wearing it has its set's effect); null otherwise.
   */
  setEffect: { pieces: number; text: string; active: boolean } | null;
  /** TechnoMagic gear: the additional skill this copy came with, like "Vigor: Increases DMG…" (null: none). */
  additional: string | null;
  /**
   * TechnoMagic gear: the additional skill its last reroll rolled, as `additional` (null: none), waiting for the member to keep
   * it or the one it has (POST /api/heroes/keep); till then it has `additional`, and its effect can't be rerolled again.
   */
  rerolled: string | null;
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
  /** A unique treasure: the hero that wears it, and which of its four it is (1 to 4: UT1 to UT4, its skills' then its passive's). Null: not one. */
  uniqueTreasure: { hero: string; skill: number } | null;
  /** The id of the member's hero wearing it, or null. */
  hero: string | null;
  /** Refining it (POST /api/heroes/refine, as the gear page's forge does), with `after` what it does on a hero at the next level. */
  refine: GearRefine;
}

/** A set a hero wears pieces of: which, how many, and each bonus with whether it is on. */
export interface HeroSetView {
  id: string;
  name: string;
  pieces: number;
  bonuses: { pieces: number; text: string; active: boolean }[];
}

/** One hero, as the shop and the heroes page show it. */
export interface HeroView {
  /** The site knows it by this id (its src/technomagic/ folder). */
  id: string;
  name: string;
  class: RaidClassId;
  /** The kind of damage its blows deal (the raid's). */
  deals: 'physical' | 'magical';
  /** What it costs in points. */
  price: number;
  owned: boolean;
  /** The copy id in each of its slots (only copies the member still owns, in a slot they fit), or null. */
  equipped: Record<HeroSlot, string | null>;
  /**
   * What its gear gives it in the raid, stat by stat, as the raid counts it: points for a chance or share
   * (crit, attack speed, penetration, block, dodge, CC resist: 1000 is 100%), and a share more of its own
   * for the rest (ATK, HP, crit damage, defence, heals, stun duration: 0.25 is 25% more), and a unique weapon's ATK
   * as it is (atkFlat), a main unique treasure's and TechnoMagic weapons' HP as it is (hpFlat), and TechnoMagic
   * armors' P.DEF and M.DEF as they are (defPhysicalFlat, defMagicalFlat).
   */
  bonus: HeroBonus;
  /** The TechnoMagic set its gear is most of: which, how many pieces, and whether its effect is on (four of them). Null with none. */
  set: { id: TmSetId; pieces: number; active: boolean } | null;
  /** Every set it wears pieces of (TechnoMagic and dragon sets), with their bonuses. */
  sets: HeroSetView[];
  /** Its artifact's effect: its name, tier (its refinement, 1 to 5) and what it does then; null: none worn. */
  artifact: { name: string; tier: number; text: string } | null;
  /** The additional skills of the TechnoMagic gear it wears that work on it (the sim's ids, one for each piece). */
  skills: string[];
  /** The same as lines, like "+25% ATK" (then its set's, and its additional skills', last). */
  totals: string[];
  /** The transcendence perks picked for it (data/transcend.ts ids, in its order). */
  perks: string[];
  /**
   * Its main treasure's effect, when that is one of its own unique treasures: its name, which of its four it is (1 to
   * 4), its tier (its refinement, 1 to 5) and what it does then. Null: none (its sub treasures give only their options).
   */
  treasure: { name: string; skill: number; tier: number; text: string } | null;
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
  /** The runes they have, not socketed (King's Raid's: the bot's data/kr-gear.ts), best first. */
  runes: HeroRuneStack[];
  /** Their komaGems and hero essences (each kind, 0 with none): what transcending pays with. */
  gems: number;
  essences: Record<EssenceId, number>;
  /** The rule their hero gear's drops are salvaged by as they drop (POST /api/heroes/auto-salvage); null: none is (left out by a bot from before it). */
  autoSalvage?: SalvageRule | null;
}

/** The tiers of King's Raid's hero gear a salvage rule can take: the dragon sets' (6 to 8) and the TechnoMagic sets' (9); never a T10's. */
export const SALVAGE_TIERS: readonly number[] = [6, 7, 8, 9];

/** The most stars a salvage rule can take a piece at (its stars, 0★ to 5★: a drop's are 0). */
export const SALVAGE_STARS_MAX = 5;

/** The parts a salvage rule can pick: those the tiers it takes have. */
export const SALVAGE_PARTS: readonly HeroPart[] = ['weapon', 'armor', 'secondary', 'accessory', 'orb'];

/**
 * Which hero gear to salvage for komaDust: the heroes page's Salvage by rule picks what matches, and, kept as the member's
 * (`autoSalvage`), the TechnoMagic Raid and the Dragon Raid salvage their drops that match as they drop, rather than give them.
 * What it takes is the bot's lib/game/items/salvage.ts salvageMatches (the site's heroes/salvage-rule.ts, the same).
 */
export interface SalvageRule {
  /** Its tiers (SALVAGE_TIERS): none, nothing matches. */
  tiers: number[];
  /** Pieces at this many stars or fewer. */
  stars: number;
  /** Only these parts (SALVAGE_PARTS); none: any. */
  parts: HeroPart[];
  /** Only gear no class but these wears (a piece every class wears matches only with none picked); none: any. */
  classes: RaidClassId[];
}

/** POST /api/heroes/sell's answer: the heroes after, and what the sale came to. */
export type HeroesSold = HeroesView & { sold: GearSale };

/** Why a change to a hero's gear wasn't made (nothing changed). */
export type HeroEquipError = 'not_found' | 'not_owned' | 'wrong_slot' | 'wrong_hero' | 'wrong_class' | 'duplicate' | 'no_main_treasure' | 'busy';

/** Why a rune wasn't socketed or taken out (nothing changed). */
export type HeroRuneError = 'not_found' | 'no_socket' | 'wrong_part' | 'no_rune' | 'busy';

/**
 * Why an option wasn't rerolled or upgraded, or a rerolled effect kept (nothing was spent). 'pending': its effect was
 * rerolled and the member hasn't kept one yet.
 */
export type HeroOptionError = 'not_found' | 'no_option' | 'too_poor' | 'no_gems' | 'pending' | 'busy';

/** Which additional skill a TechnoMagic copy keeps after its reroll (POST /api/heroes/keep): the one it had, or the one rolled. */
export type HeroKeep = 'old' | 'new';

/** Why a copy wasn't refined (nothing was used up). */
export type HeroRefineError = RefineBlock | 'bad_material' | 'not_found' | 'busy';

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
export const HERO_STAT_IDS = [
  'atkFlat',
  'atk',
  'hpFlat',
  'hp',
  'crit',
  'critDamage',
  'speed',
  'pen',
  'acc',
  'defense',
  'defPhysicalFlat',
  'defPhysical',
  'defMagicalFlat',
  'defMagical',
  'block',
  'blockPhysical',
  'blockMagical',
  'blockDef',
  'blockDefPhysical',
  'blockDefMagical',
  'dodge',
  'dodgePhysical',
  'dodgeMagical',
  'tough',
  'toughPhysical',
  'toughMagical',
  'resist',
  'accuracy',
  'lifesteal',
  'critResist',
  'critResistPhysical',
  'critResistMagical',
  'heal',
  'recovery',
  'control',
  'manaAttack',
  'manaRegen',
  'manaDamage',
] as const;
export type HeroStat = (typeof HERO_STAT_IDS)[number];

/** What gear gives a hero: a share for each stat (0.1: 10% more, or 100 points). */
export type HeroBonus = Record<HeroStat, number>;
