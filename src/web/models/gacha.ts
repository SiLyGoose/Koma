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
import type { BannerId, ItemDef, Stars } from '../../types.js';
import type { BannerItem, BannerPull, BannerResult, BannerView, HeroBanner, LimitedBanner } from '../../protocol/gacha.js';

export type { BannerItem, BannerPull, BannerResult, BannerView, HeroBanner, LimitedBanner };

/*
 * The site's banner page (GET /api/gacha, POST /api/gacha/pull, POST /api/gacha/pick): pulling from
 * the gacha, as `gacha` and `gacha multi` do in Discord (the same payment, pity and guarantee:
 * services/economy/gacha.ts), what the page shows beside the buttons (the price, their komaTokens,
 * their pity, the odds), and picking the item the guarantee gives. Each takes which banner (`banner`:
 * the standard one when left out).
 */

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
