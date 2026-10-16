import type { Slot, Stars } from './items.js';
import type { RaidClassId } from './raid.js';

/* The gear page on the site: what the bot's GET /api/gear (and its POSTs) say of a member's gear. */

/** One copy a member owns, as the gear page shows it. */
export interface GearCopy {
  /** The copy's id (ItemCopyDoc._id): what the page equips. */
  id: string;
  itemId: string;
  name: string;
  stars: Stars;
  slot: Slot;
  description: string;
  level: number;
  /** Its top refinement level: 1 for TechnoMagic gear, which is never refined (no level is shown for it, and no refine offered). */
  maxLevel: number;
  /** What it does for this member at this level: a TechnoMagic copy's potentials (what it does on a hero). */
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
  /** Worn by a hero of a class it doesn't work on: none of it counts there, not even its stats (the page greys them out). */
  wrongClass: boolean;
  /** Someone else's exclusive item: the share of its effects this member gets (null when it's theirs to use). */
  borrowed: number | null;
  /** Refining it (services/items/refine.ts), for the page's confirmation. */
  refine: GearRefine;
  /** Locked by the member (services/items/lock.ts): never sold or used up by a refine. */
  locked: boolean;
  /** What selling it pays in points (services/items/sell.ts): null when it's worn, saved in a loadout, on a hero or locked, so never sold. */
  sell: number | null;
  /** TechnoMagic gear, a unique weapon or a unique treasure: only heroes wear it (the heroes page), never the member. */
  heroOnly: boolean;
  /** A unique weapon: the id of the one hero that wields it (null: not one). */
  uniqueWeapon: string | null;
  /** A unique treasure: the hero that wears it, and which of its four it is (1 to 4: UT1 to UT4, its skills' then its passive's). Null: not one. */
  uniqueTreasure: { hero: string; skill: number } | null;
  /** A class item (raid gear, and all TechnoMagic gear): the class it works for (null: any). */
  itemClass: RaidClassId | null;
  /** The name of the TechnoMagic hero wearing it (the heroes page), or null when none is. */
  hero: string | null;
}

/** Refining a copy: what the page asks the member to confirm. */
export interface GearRefine {
  /** Why it can't be done now (null when it can). */
  blocked: RefineBlock | null;
  /** What the next level costs in points (null at the top level). */
  cost: number | null;
  /** The level of the spare copy it would use up when none is picked (null when there's none to use). */
  spare: number | null;
  /** What it would do at the next level, as `effects` (null when it can't go up). */
  after: string[] | null;
}

/**
 * Why a copy can't be refined: it's at the top level (TechnoMagic gear always is), there's no spare copy of it to use up (another
 * copy of its item that isn't worn, saved in a loadout or locked), or they can't pay for it.
 * Every copy is refined as itself on the site, whatever level its item's other copies are at.
 */
export type RefineBlock = 'maxed' | 'no_duplicate' | 'too_poor';

/** GET /api/gear: a member's gear. */
export interface GearView {
  /** The copy id in each slot, or null when it's empty. */
  equipped: Record<Slot, string | null>;
  /** Everything they own, best first (stars, then level, then name). */
  copies: GearCopy[];
  /** What everything equipped adds up to. */
  totals: string[];
  /** Their loadouts, in order: the active one is what they're wearing. */
  loadouts: GearLoadout[];
  /** Every number their gear can change, with and without it (the page's Common tab), raid last. */
  stats: StatSection[];
  /** Their points in the server (null when not known), for what a refine leaves them. */
  balance: number | null;
  /** The outfit they wear (data/outfits.ts): the character the page draws them as. */
  outfit: string;
  /** Their raid class (services/raid-class.ts), or null with none: the page's class ribbon shows and changes it. */
  class: RaidClassId | null;
  /** Every raid class, for the ribbon's picker: its name and what it does in a fight, a line of Discord markdown each. */
  classes: { id: RaidClassId; name: string; traits: string[] }[];
}

/** One of a member's loadouts, as the gear page shows it. */
export interface GearLoadout {
  number: number;
  name: string;
  active: boolean;
  /** The copy id in each slot (only copies they still own, in the slot they fit), or null. */
  equipped: Record<Slot, string | null>;
}

/**
 * Why a loadout can't take a name (lib/game/items/loadouts.ts's checkLoadoutName): it's too long, has
 * characters a name can't, has no letter, is a word the loadout command uses, or is another of their loadouts'.
 */
export type LoadoutNameBlock = `name_${LoadoutNameProblem}`;
export type LoadoutNameProblem = 'too_long' | 'bad_characters' | 'no_letters' | 'reserved' | 'taken';

/** What a sale from the gear page sold (POST /api/gear/sell answers the GearView with it). */
export interface GearSale {
  count: number;
  earned: number;
}

/** One number: what it is with their gear, and what it would be without (null when gear doesn't change it). */
export interface StatRow {
  label: string;
  value: string;
  base: string | null;
}

export interface StatSection {
  title: string;
  rows: StatRow[];
}

/** Who in a server has gear to look at (GET /api/gear/members): the one asking first, then whoever owns the most. */
export interface GearMembers {
  members: { userId: string; name: string; avatar: string; copies: number; you: boolean; class: RaidClassId | null }[];
}

/** POST /api/gear/sell: their gear after, and what the sale sold. */
export type GearSold = GearView & { sold: GearSale };
