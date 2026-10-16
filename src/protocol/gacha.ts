import type { BannerId, Slot, Stars } from './items.js';

/* The gacha's banners on the site: what the bot's GET /api/gacha, POST /api/gacha/pull and /pick say. */

/** An item a banner shows off. */
export interface BannerItem {
  itemId: string;
  name: string;
  stars: Stars;
  slot: Slot;
  description: string;
  /** A unique weapon: the id of the one hero that wields it (null: not one). */
  uniqueWeapon: string | null;
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

/** The Hero Item banner (always open): its top-tier items are the heroes' unique weapons, each as likely, and it has no guarantee. */
export interface HeroBanner {
  /** Its unique weapons. */
  featured: BannerItem[];
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
   * Their next top-tier item is one of their own treasures (their last was someone else's). On the
   * limited banner: it is a featured item (their last one there wasn't).
   */
  guaranteed: boolean;
  /**
   * The unique treasure made for them, which the standard banner's guarantee gives (their first, if
   * they have more): null when none is theirs, so there's no guarantee, and on the limited banner.
   */
  own: { itemId: string; name: string; stars: Stars; slot: Slot } | null;
  /**
   * The items this banner's guarantee can give them (their own treasures, or the limited banner's
   * featured items), and the one they picked for it to give (an item id): null for any of them.
   */
  choices: { itemId: string; name: string; stars: Stars; slot: Slot }[];
  pick: string | null;
  /** Each tier's chance (0 to 1) on a pull before pity raises the top one. */
  rates: Record<Stars, number>;
  /** The chance (0 to 1) each of their pulls gives a second item for nothing (Pot of Greed): 0 without it. */
  extraChance: number;
}

/** One item pulled, in the order they came. */
export interface BannerPull {
  itemId: string;
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
