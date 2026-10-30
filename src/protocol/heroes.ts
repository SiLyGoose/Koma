import type { MainStat, Slot, Stars, TmSetId } from './items.js';
import type { GearRefine, GearSale, RefineBlock } from './gear.js';
import type { RaidClassId } from './raid.js';
import type { RuneBoxId } from './runes.js';

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

/** The TP a hero has at its most from transcending (Transcendence Scrolls add more: TP_SCROLL_MOST). */
export const TRANSCEND_POINTS = TRANSCEND_TP[TRANSCEND_MAX] as number;

/**
 * A Transcendence Scroll: crafted from any one TechnoMagic set's Boss Crystals (POST /api/heroes/craft-scroll; its price
 * HeroesCraft's `tpScroll`), held (HeroesView's `tpScrolls`) until used on a hero (POST /api/heroes/scroll), which gives that
 * hero TP_SCROLL_POINTS more TP for good, on top of its level's, up to TP_SCROLL_MOST from scrolls (95 TP at Transcend 5).
 */
export const TP_SCROLL_POINTS = 5;

/** The most TP scrolls give one hero (three of them). */
export const TP_SCROLL_MOST = 15;

/**
 * A hero's Transcend Perk pages (King's Raid's: up to 3 for each hero, its MaxTranscendHeroSkillPage): each its own pick of
 * perks out of the same TP, one of them in use (the fight's). Page 1 comes with the hero; the next one is bought for that
 * hero (POST /api/heroes/perk-page/buy, for HeroView.perkPages' `next` zeiucoins) and starts empty and in use; any bought
 * one is put in use again with POST /api/heroes/perk-page.
 */
export const PERK_PAGES_MAX = 3;

/**
 * Hero gear loadouts: King's Raid's Gear Custom (its EquipPresetInfo and StorageSlotExtendTable). They are the member's, not a
 * hero's: numbered slots, HERO_LOADOUTS.free of them to begin with and more bought one at a time (POST /api/heroes/loadout/buy,
 * for HeroLoadouts' `next` zeiucoins) up to HERO_LOADOUTS.most. Each keeps a hero's pieces in HERO_LOADOUT_SLOTS (never its
 * Weapon or treasures, as King's Raid's): Save puts the pieces the hero shown wears there in it (POST /api/heroes/loadout/save),
 * Equip puts its pieces on the hero shown (POST /api/heroes/loadout/equip: off any other hero wearing them), Reset empties it
 * (POST /api/heroes/loadout/reset), and it can be named (POST /api/heroes/loadout/name). A piece kept in one is never sold,
 * salvaged or used up by a refine, as a worn one isn't.
 */
export const HERO_LOADOUTS = { free: 4, most: 40, maxNameLength: 24 } as const;

/** The slots a hero gear loadout keeps (King's Raid's SaveEquipParts: Armor, Mantle, Accessory, Orb and Artifact). */
export const HERO_LOADOUT_SLOTS: readonly HeroSlot[] = ['armor', 'secondary', 'accessory', 'orb', 'artifact'];

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
  /**
   * A TechnoMagic piece that is Reclaimed (King's Raid's): its main stat higher, its awakening dearer in Upgrade Stones; its
   * name says so. Left out for any other.
   */
  reclaimed?: boolean;
  /** A TechnoMagic piece: the Upgrade Stones of its class salvaging it gives besides its komaDust (King's Raid's). Left out for any other. */
  salvageStones?: { class: RaidClassId; count: number };
  /** A TechnoMagic piece: the Boss Crystals of its set (`set`) salvaging it gives too (King's Raid's). Left out for any other. */
  salvageCrystals?: { set: TmSetId; count: number };
  /**
   * A TechnoMagic piece: its options are rerolled with its set's (`set`) Boss Crystals, King's Raid's, not zeiucoins: `reroll` and
   * each option's `price` are how many. Left out for any other.
   */
  rerollCrystals?: TmSetId;
  /** A TechnoMagic piece: the Boss Crystals of its set (rerollCrystals') rerolling its unique option takes too, beside `rerollUnique`'s komaGems. Left out for any other. */
  rerollUniqueCrystals?: number;
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
   * additional skill; komaGems, a TechnoMagic piece's with rerollUniqueCrystals), and upgrading an option (POST /api/heroes/upgrade with its `option`: its amount rolled
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
  /**
   * The option its last reroll rolled (for its `index`th, as `options` has them), waiting for the member to keep
   * it or the one it has (POST /api/heroes/keep with that `option`, King's Raid's Reforge); till then it has `options`, and
   * none of them can be rerolled or enhanced. Null: none waits.
   */
  rerolledOption: (HeroOption & { index: number }) | null;
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
  /** The transcendence perks picked for it (data/transcend.ts ids, in its order): those of its perk page in use. */
  perks: string[];
  /**
   * Its Transcend Perk pages (PERK_PAGES_MAX): the one in use (1 on), each bought one's perks in order (as `perks` has them;
   * the one in use's is `perks`), and what buying the next costs in zeiucoins (null: all bought). Left out by a bot from before them.
   */
  perkPages?: { active: number; pages: string[][]; next: number | null };
  /**
   * Its main treasure's effect, when that is one of its own unique treasures: its name, which of its four it is (1 to
   * 4), its tier (its refinement, 1 to 5) and what it does then. Null: none (its sub treasures give only their options).
   */
  treasure: { name: string; skill: number; tier: number; text: string } | null;
  /** What those perks give its stats (its share too of what they give every ally), a line each, like "+30% Attack". */
  perkEffects: string[];
  /**
   * How far it is transcended (0 to TRANSCEND_MAX), the TP it has (its level's and its scrolls'), and what the next level costs
   * (null: none); `scrolls`, the TP Transcendence Scrolls gave it (0 to TP_SCROLL_MOST; left out by a bot from before them).
   */
  transcend: { level: number; points: number; scrolls?: number; next: { essences: Partial<Record<EssenceId, number>>; gems: number } | null };
  /** The skin it's in (Koma-UI's src/technomagic/assets/heroes/<hero>.ts name): the outfit it wears, else its own look (left out by a bot from before outfits). */
  outfit?: string;
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
  /** Their Rune Fragments (disassembling runes gives them; they craft Mysterious Runes: protocol/runes.ts). Left out by a bot from before them. */
  runeFragments?: number;
  /** Their komaGems and hero essences (each kind, 0 with none): what transcending pays with. */
  gems: number;
  essences: Record<EssenceId, number>;
  /**
   * Their Technomagic Gear Upgrade Stones, by class (0 with none): what awakens a TechnoMagic piece of that class (King's
   * Raid's), dropped by the TechnoMagic Raid from stage 7. Left out by a bot from before them.
   */
  stones?: Record<RaidClassId, number>;
  /**
   * Their Boss Crystals, by TechnoMagic set (0 with none; King's Raid's: Crystal of Galgoria is Perseverance's): what crafts that
   * set's pieces (POST /api/heroes/craft) and rerolls their options. Left out by a bot from before them.
   */
  crystals?: Record<TmSetId, number>;
  /** Their Transcendence Scrolls, not used yet (TP_SCROLL_POINTS). Left out by a bot from before them. */
  tpScrolls?: number;
  /** What crafting TechnoMagic gear and Mysterious Runes costs (left out by a bot from before it was a setting). */
  craft?: HeroesCraft;
  /** The rule their hero gear's drops are salvaged by as they drop (POST /api/heroes/auto-salvage); null: none is (left out by a bot from before it). */
  autoSalvage?: SalvageRule | null;
  /** The Dispatch Battle Loot they hold, unopened (none: empty; left out by a bot from before them). */
  lootBoxes?: LootBoxStack[];
  /** The most of them POST /api/heroes/open-box opens at once (left out by a bot from before them). */
  lootOpenMost?: number;
  /** Their hero gear loadouts (HERO_LOADOUTS). Left out for someone else's heroes, and by a bot from before them. */
  loadouts?: HeroLoadouts;
}

/** A member's hero gear loadouts: every one they have, in order, and what buying the next costs in zeiucoins (null: they have HERO_LOADOUTS.most). */
export interface HeroLoadouts {
  slots: HeroLoadoutView[];
  next: number | null;
}

/**
 * One hero gear loadout: its number (1 on), the name they gave it (null: none, "Loadout <number>"), and the copy kept in each of
 * HERO_LOADOUT_SLOTS (only copies they still own; null: none).
 */
export interface HeroLoadoutView {
  number: number;
  name: string | null;
  pieces: Partial<Record<HeroSlot, string | null>>;
}

/**
 * King's Raid's Dispatch Battle Loot (the bot's data/loot-boxes.ts): what a won background raid gives, from its mail, held in the
 * Inventory's Others until opened. Its id (King's Raid's item code), name and icon (the site's public/kr/items/<icon>.webp), the
 * raid, boss (and its name), mode and stage whose win it gives, and how many they hold.
 */
export interface LootBoxStack {
  id: string;
  name: string;
  icon: string;
  raid: 'technomagic' | 'dragon';
  boss: string;
  bossName: string;
  mode: 'hard' | 'normal';
  stage: number;
  count: number;
}

/**
 * What opening Dispatch Battle Loot gave, all told (POST /api/heroes/open-box): how many were opened (fewer than asked: one
 * couldn't be, and the rest were given back), zeiucoins, hero essences, Upgrade Stones and Boss Crystals (a salvaged drop's
 * too), runes (by id), the hero gear copies given, and the komaDust of drops their salvage rule took.
 */
export interface LootOpened {
  box: string;
  count: number;
  points: number;
  essences: Partial<Record<EssenceId, number>>;
  stones: Partial<Record<RaidClassId, number>>;
  crystals: Partial<Record<TmSetId, number>>;
  runes: Record<string, number>;
  copies: string[];
  dust: number;
}

/** POST /api/heroes/open-box: their heroes after (the copies given among them), and what the boxes gave. */
export type HeroesOpened = HeroesView & { opened: LootOpened };

/** Why no Dispatch Battle Loot was opened: no such box, or they don't hold that many. */
export type LootOpenError = 'not_found' | 'not_enough';

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

/**
 * Why a hero gear loadout wasn't saved, put on, emptied, named or bought (nothing changed, nothing was spent): 'not_found', a
 * hero that isn't theirs; 'locked', a loadout they haven't bought; 'nothing_worn', saving a hero that wears none of
 * HERO_LOADOUT_SLOTS; 'empty', putting on a loadout with nothing in it; 'wrong_class', one with nothing the hero can wear; 'too_long',
 * a name past HERO_LOADOUTS.maxNameLength; 'bad_name', one with characters a name can't have; 'maxed', every loadout bought;
 * 'too_poor', too few zeiucoins; 'busy', their heroes' gear or loadouts changed meanwhile.
 */
export type HeroLoadoutError = 'not_found' | 'locked' | 'nothing_worn' | 'empty' | 'wrong_class' | 'too_long' | 'bad_name' | 'maxed' | 'too_poor' | 'busy';

/**
 * Why a rune wasn't socketed or taken out (nothing changed): too_poor, too few zeiucoins to keep the one taken out (or put in
 * over: protocol/runes.ts RUNE_KEEP_PRICE).
 */
export type HeroRuneError = 'not_found' | 'no_socket' | 'wrong_part' | 'no_rune' | 'too_poor' | 'busy';

/**
 * Why an option wasn't rerolled or upgraded, or a rerolled effect or option kept (nothing was spent). 'pending': its effect
 * (or one of its options) was rerolled and the member hasn't kept one yet.
 */
export type HeroOptionError = 'not_found' | 'no_option' | 'too_poor' | 'no_gems' | 'no_crystals' | 'pending' | 'busy';

/**
 * Crafting a TechnoMagic set's piece (POST /api/heroes/craft, King's Raid's Valance's Workshop): any of its pieces, any class's
 * piece of a part picked, or a class's part picked, for its Boss Crystals and zeiucoins (HeroesView.craft's `tm`).
 */
export type TmCraftKind = 'any' | 'part' | 'exact';

/**
 * What crafting costs, as the bot's settings say (its config's `craft`): each way of crafting a TechnoMagic piece (`tm`: the
 * set's Boss Crystals, and zeiucoins), and one Mysterious Rune of each (`runes`: Rune Fragments; protocol/runes.ts RUNE_BOXES).
 */
export interface HeroesCraft {
  tm: Record<TmCraftKind, { crystals: number; points: number }>;
  runes: Record<RuneBoxId, number>;
  /** The Boss Crystals, any one set's, one Transcendence Scroll takes (left out by a bot from before them). */
  tpScroll?: number;
}

/** The parts a TechnoMagic piece can be crafted as (an accessory: any of its four kinds, or the one of TM_ACCESSORIES picked). */
export const TM_CRAFT_PARTS: readonly HeroPart[] = ['armor', 'secondary', 'accessory', 'orb'];

/** An accessory's four kinds (King's Raid's), any of which crafting one can be narrowed to (POST /api/heroes/craft's `accessory`). */
export const TM_ACCESSORIES = ['ring', 'earrings', 'necklace', 'bracelet'] as const;
export type TmAccessory = (typeof TM_ACCESSORIES)[number];

/** Each accessory's name, as the pages say it. */
export const TM_ACCESSORY_NAME: Readonly<Record<TmAccessory, string>> = { ring: 'Ring', earrings: 'Earrings', necklace: 'Necklace', bracelet: 'Bracelet' };

/** POST /api/heroes/craft: their heroes after, and the piece crafted (its copy's id, and its name: "Reclaimed …" for one). */
export type HeroesCrafted = HeroesView & { crafted: { copy: string; name: string } };

/** Why a TechnoMagic piece wasn't crafted (nothing was spent): too few Boss Crystals, too few zeiucoins, or no piece is so. */
export type TmCraftError = 'no_crystals' | 'too_poor' | 'no_piece' | 'busy';

/**
 * Which additional skill a TechnoMagic copy keeps after its reroll (POST /api/heroes/keep), or which option a copy keeps after
 * one of them was rerolled (with `option`, its index): the one it had, or the one rolled.
 */
export type HeroKeep = 'old' | 'new';

/** Why a copy wasn't refined (nothing was used up). */
export type HeroRefineError = RefineBlock | 'bad_material' | 'not_found' | 'busy';

/** Why a hero's transcendence perks weren't picked (nothing changed). */
export type HeroPerksError = 'not_found' | 'perk_locked' | 'too_many_points';

/**
 * Why a hero's perk page wasn't put in use or bought (nothing was spent): 'locked', a page not bought yet (or, buying,
 * not the next one); 'owned', bought already; 'maxed', all bought; 'too_poor', too few zeiucoins; 'busy', its pages changed meanwhile.
 */
export type HeroPerkPageError = 'not_found' | 'locked' | 'owned' | 'maxed' | 'too_poor' | 'busy';

/** Why a hero wasn't transcended (nothing was spent). */
export type HeroTranscendError = 'not_found' | 'maxed' | 'too_poor' | 'busy';

/** Why Transcendence Scrolls weren't crafted (nothing was spent): too few of that set's Boss Crystals. */
export type TpScrollCraftError = 'no_crystals';

/** Why a Transcendence Scroll wasn't used on a hero (nothing was spent): none held, or the hero has all scrolls give ('scrolls_maxed'). */
export type TpScrollUseError = 'not_found' | 'no_scroll' | 'scrolls_maxed';

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
