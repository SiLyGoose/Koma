import type { HeroPart } from './heroes.js';
import type { BannerId, Slot, Stars } from './items.js';

/* The gacha's banners on the site: what the bot's GET /api/gacha, GET /api/gacha/history, POST /api/gacha/pull and /pick say. */

/** An item a banner shows off. */
export interface BannerItem {
  itemId: string;
  name: string;
  stars: Stars;
  slot: Slot;
  description: string;
  /** A unique weapon: the id of the one hero that wields it (null: not one). */
  uniqueWeapon: string | null;
  /** A unique treasure: the hero that wears it, and which of its four it is (1 to 4: UT1 to UT4, its skills' then its passive's). Null: not one. */
  uniqueTreasure: { hero: string; skill: number } | null;
}

/** The limited banner (data/items/banner.ts), on either banner's view so the page knows whether to offer it. */
export interface LimitedBanner {
  name: string;
  /** Whether it takes pulls now. */
  open: boolean;
  /** When it opens and closes (ms since the epoch): null where none is set (no start: there is no limited banner). */
  startsAt: number | null;
  endsAt: number | null;
  /** Its featured items. */
  featured: BannerItem[];
  /** The chance (0 to 1) a top-tier item from it is a featured one, when that isn't guaranteed. */
  featuredChance: number;
}

/**
 * The Hero Item banner (always open): its top-tier items are the heroes' unique weapons and unique treasures, as King's
 * Raid's Treasure Summon has them (a unique weapon as likely as a unique treasure; each of a kind as likely), and it has
 * no guarantee.
 */
export interface HeroBanner {
  /** Its unique weapons, and its unique treasures. */
  featured: BannerItem[];
  treasures: BannerItem[];
  /** The chance (0 to 1) a top-tier item from it is a unique weapon (the rest: a unique treasure). */
  weaponShare: number;
  /**
   * The chance (0 to 1) a unique weapon comes refined to each level (R1 first: King's Raid's 0★ to 3★ odds), and a unique
   * treasure (always R1).
   */
  weaponLevels: number[];
  treasureLevels: number[];
}

/** GET /api/gacha: what a pull costs the member, and where their pity stands on a banner. */
export interface BannerView {
  /** The banner this is the view of: `pity` and `guaranteed` are that banner's. */
  banner: BannerId;
  limited: LimitedBanner;
  hero: HeroBanner;
  /** One pull in points, after their gear (a pull paid with a komaToken costs none). */
  cost: number;
  /** One pull in points without gear. */
  baseCost: number;
  /** How many pulls a multi pull makes. */
  multi: number;
  balance: number;
  /** komaTokens: each pays for one pull, before any points. */
  tokens: number;
  /** The tier pity works on (its items are the unique treasures). */
  topStars: Stars;
  /** Pulls since their last top-tier item, and the pull that guarantees one: null when pity isn't in effect. */
  pity: { count: number; softStart: number; hardPity: number } | null;
  /**
   * Their next top-tier item here is one the guarantee is for (their last one here wasn't): one of their own treasures
   * (standard), a featured item (limited), or the item they picked (`pick`, where it is another).
   */
  guaranteed: boolean;
  /**
   * The unique treasure made for them, which the standard banner's guarantee gives (their first, if
   * they have more): null when none is theirs, so there's no guarantee, and on the limited banner.
   */
  own: { itemId: string; name: string; stars: Stars; slot: Slot } | null;
  /**
   * The items they can pick for this banner's guarantee to give (any exclusive treasure on the standard banner, their
   * own first; the limited banner's featured items; any unique weapon or treasure on the Hero Item one), and the one
   * they picked (an item id). Null: none picked, so the guarantee is for any of their own treasures (standard), any
   * featured item (limited), or there is none (the Hero Item banner; the standard one for a member with no treasure).
   */
  choices: GuaranteeChoice[];
  pick: string | null;
  /** Each tier's chance (0 to 1) on a pull before pity raises the top one. */
  rates: Record<Stars, number>;
  /** The chance (0 to 1) each of their pulls gives a second item for nothing (Pot of Greed): 0 without it. */
  extraChance: number;
}

/** An item the guarantee can be picked to give: its name and tier, whether it is one of the member's own treasures, and a unique weapon's or treasure's hero. */
export interface GuaranteeChoice {
  itemId: string;
  name: string;
  stars: Stars;
  slot: Slot;
  /** Made for them (their own exclusive treasure). Left out: a bot from before. */
  mine?: boolean;
  /** A unique weapon: the id of the hero that wields it (null: not one). Left out: a bot from before. */
  uniqueWeapon?: string | null;
  /** A unique treasure: the hero that wears it, and which of its four it is. Null: not one. Left out: a bot from before. */
  uniqueTreasure?: { hero: string; skill: number } | null;
}

/** One item pulled, in the order they came. */
export interface BannerPull {
  itemId: string;
  /** King's Raid's icon for it (Koma-UI's public/kr/items/<icon>.webp: the Hero Item banner's gear, artifacts, tickets and runes); null: its own picture. */
  icon?: string | null;
  name: string;
  stars: Stars;
  slot: Slot;
  description: string;
  /** Their first copy of it ever (selling one doesn't make it new again). */
  isNew: boolean;
  /** How many copies of it they own now. */
  count: number;
  /** Someone else's exclusive item: the share of its effects this member gets (null when it's theirs to use). */
  borrowed: number | null;
  /** A unique weapon: the id of the one hero that wields it (null: not one). */
  uniqueWeapon: string | null;
  /** A unique treasure: the hero that wears it, and which of its four it is (1 to 4: UT1 to UT4, its skills' then its passive's). Null: not one. */
  uniqueTreasure: { hero: string; skill: number } | null;
  /** How far the copy came refined (1: R1, a new copy's); a hero's gear (heroOnly), its stars. */
  level: number;
  /** A hero's gear (King's Raid's pieces and artifacts, unique weapons and treasures): its level is its stars. Left out: a bot from before. */
  heroOnly?: boolean;
}

/** POST /api/gacha/pull: what came out, what it was paid with, and the banner as it stands after. */
export interface BannerResult {
  pulls: BannerPull[];
  /** The items the pulls gave on top for nothing (Pot of Greed), in order. */
  extras: BannerPull[];
  /** Points spent, after gear. */
  cost: number;
  /** komaTokens spent. */
  tokensUsed: number;
  view: BannerView;
}

/** One item pulled, as a member's pull history has it. */
export interface PullRecord {
  itemId: string;
  name: string;
  stars: Stars;
  slot: Slot;
  /** Hero gear: the part of a hero it is (an accessory's slot is the treasure's). Null: not hero gear. */
  part: HeroPart | null;
  /** Not gear but what it gives: a unique weapon or treasure ticket (picked in the mailbox), or a rune. Null: gear. */
  grant: 'ticket' | 'rune' | null;
  /** King's Raid's icon for it (as BannerPull's); null: its own picture. */
  icon: string | null;
  /** Given on top of a pull for nothing (Pot of Greed). */
  bonus: boolean;
  /** An item no longer in the game (its name is its id). */
  removed: boolean;
  /** When it was pulled (ms since the epoch). */
  at: number;
}

/** GET /api/gacha/history: a page of a member's pulls on a banner, the newest first. */
export interface PullHistory {
  banner: BannerId;
  /** This page (1: the newest pulls), how many there are (at least 1), and how many pulls a page shows. */
  page: number;
  pages: number;
  perPage: number;
  /** Their pulls on the banner in all. */
  total: number;
  pulls: PullRecord[];
}
