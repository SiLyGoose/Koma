import { CONFIG, STARS } from '../../config.js';
import { MULTI_PULLS, PITY_STARS } from '../../constants/index.js';
import { collections } from '../../db.js';
import { featuredItems, LIMITED_BANNER, UNIQUE_WEAPONS } from '../../data/items.js';
import { limitedWindow } from '../../lib/game/items/banner.js';
import { canUseItem, gearEffects, itemEffectiveness } from '../../lib/game/items/equipment.js';
import { guaranteeChoices, ownTreasures, topChance } from '../../lib/game/items/gacha.js';
import { extraPullChance, pullCost } from '../../perks/index.js';
import { guaranteePick, isGuaranteed, pityCount, pullGacha, pullMulti, setGuaranteePick, type PulledItem } from '../../services/economy/index.js';
import { resolveGear } from '../../services/items/gear.js';
import type { BannerId, ItemDef, Slot, Stars } from '../../types.js';

/*
 * The site's banner page (GET /api/gacha, POST /api/gacha/pull, POST /api/gacha/pick): pulling from
 * the gacha, as `gacha` and `gacha multi` do in Discord (the same payment, pity and guarantee:
 * services/economy/gacha.ts), what the page shows beside the buttons (the price, their komaTokens,
 * their pity, the odds), and picking the item the guarantee gives. Each takes which banner (`banner`:
 * the standard one when left out).
 */

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

/** What the gacha routes use (the database's, unless a test says otherwise). */
export interface GachaStore {
  view: (guildId: string, userId: string, banner: BannerId) => Promise<BannerView>;
  /** One pull, or a multi pull: what came out, or why not (nothing was spent): 'too_poor', or 'closed' for a limited banner that isn't open. */
  pull: (guildId: string, userId: string, multi: boolean, banner: BannerId) => Promise<BannerResult | 'too_poor' | 'closed'>;
  /** Picks the item a banner's guarantee gives them (null: any of them): the banner after, or 'not_found' when the guarantee can't give that item. */
  pick: (guildId: string, userId: string, banner: BannerId, itemId: string | null) => Promise<BannerView | 'not_found'>;
}

const bannerItem = (item: ItemDef): BannerItem => ({ itemId: item.id, name: item.name, stars: item.stars, slot: item.slot, description: item.description, uniqueWeapon: item.uniqueWeapon ?? null });

/** The limited banner as it stands now. */
export function limitedBanner(now: number = Date.now()): LimitedBanner {
  const { open, start, end } = limitedWindow(CONFIG.gacha.limited, now);
  return {
    name: LIMITED_BANNER.name,
    open,
    startsAt: start,
    endsAt: end,
    featured: featuredItems().map(bannerItem),
    featuredChance: CONFIG.gacha.limited.featuredChance,
  };
}

/** Each tier's share of the pull weights. */
function rates(): Record<Stars, number> {
  const weights = CONFIG.gacha.starWeights;
  const total = STARS.reduce((sum, stars) => sum + weights[stars], 0);
  const out = {} as Record<Stars, number>;
  for (const stars of STARS) out[stars] = total > 0 ? weights[stars] / total : 0;
  return out;
}

const pulled = (userId: string, { item, isNew, count }: PulledItem): BannerPull => ({
  itemId: item.id,
  name: item.name,
  stars: item.stars,
  slot: item.slot,
  description: item.description,
  isNew,
  count,
  borrowed: canUseItem(item, userId) ? null : itemEffectiveness(item, userId),
  uniqueWeapon: item.uniqueWeapon ?? null,
});

async function bannerView(guildId: string, userId: string, banner: BannerId): Promise<BannerView> {
  const member = await collections().members.findOne({ guildId, userId });
  const { softStart, hardPity } = CONFIG.gacha.pity;
  // As pullMany counts it: only while pity is on and the top tier can be pulled at all.
  const pityOn = hardPity > 0 && topChance(1) > 0;
  // Only the standard banner's guarantee gives their own treasure.
  const [own] = banner === 'standard' ? ownTreasures(userId) : [];
  const brief = (item: ItemDef) => ({ itemId: item.id, name: item.name, stars: item.stars, slot: item.slot });
  const gear = gearEffects(await resolveGear(guildId, userId, member?.equipment), userId);
  return {
    banner,
    limited: limitedBanner(),
    hero: { featured: UNIQUE_WEAPONS.map(bannerItem) },
    cost: pullCost(CONFIG.gacha.cost, gear),
    baseCost: CONFIG.gacha.cost,
    multi: MULTI_PULLS,
    balance: member?.points ?? 0,
    tokens: member?.tokens ?? 0,
    topStars: PITY_STARS,
    pity: pityOn ? { count: pityCount(member, banner), softStart, hardPity } : null,
    guaranteed: isGuaranteed(member, banner),
    own: own ? brief(own) : null,
    choices: guaranteeChoices(userId, banner).map(brief),
    pick: guaranteePick(member, userId, banner),
    rates: rates(),
    extraChance: extraPullChance(gear),
  };
}

export const gachaStore: GachaStore = {
  view: bannerView,
  pull: async (guildId, userId, multi, banner) => {
    const result = multi ? await pullMulti(guildId, userId, banner) : await pullGacha(guildId, userId, banner);
    if (!result.ok) return result.reason;
    const [pulls, extras] = 'pulls' in result ? [result.pulls, result.extras] : [[result], result.extra ? [result.extra] : []];
    return {
      pulls: pulls.map((pull) => pulled(userId, pull)),
      extras: extras.map((pull) => pulled(userId, pull)),
      cost: result.cost,
      tokensUsed: result.tokensUsed,
      view: await bannerView(guildId, userId, banner),
    };
  },
  pick: async (guildId, userId, banner, itemId) => ((await setGuaranteePick(guildId, userId, banner, itemId)) ? bannerView(guildId, userId, banner) : 'not_found'),
};
