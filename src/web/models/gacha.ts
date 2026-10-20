import { CONFIG, STARS } from '../../config.js';
import { MULTI_PULLS, PITY_STARS } from '../../constants/index.js';
import { collections } from '../../db.js';
import { featuredItems, HERO_BANNER, ITEMS_BY_ID, LIMITED_BANNER, UNIQUE_TREASURES, UNIQUE_WEAPONS } from '../../data/items.js';
import { limitedWindow } from '../../lib/game/items/banner.js';
import { canUseItem, gearEffects, itemEffectiveness } from '../../lib/game/items/equipment.js';
import { heroOnly } from '../../lib/game/heroes.js';
import { bannerWeights, guaranteeChoices, ownTreasures, topChance } from '../../lib/game/items/gacha.js';
import { HISTORY_PAGE, historyFilter } from '../../lib/game/items/history.js';
import { extraPullChance, pullCost } from '../../perks/index.js';
import { guaranteePick, isGuaranteed, pityCount, pullGacha, pullMulti, setGuaranteePick, type PulledItem } from '../../services/economy/index.js';
import { resolveGear } from '../../services/items/gear.js';
import type { BannerId, ItemDef, Stars } from '../../types.js';
import type { BannerItem, BannerPull, BannerResult, BannerView, GuaranteeChoice, HeroBanner, LimitedBanner, PullHistory, PullRecord } from '../../protocol/gacha.js';

export type { BannerItem, BannerPull, BannerResult, BannerView, GuaranteeChoice, HeroBanner, LimitedBanner, PullHistory, PullRecord };

/*
 * The site's banner page (GET /api/gacha, POST /api/gacha/pull, POST /api/gacha/pick): pulling from
 * the gacha, as `gacha` and `gacha multi` do in Discord (the same payment, pity and guarantee:
 * services/economy/gacha.ts), what the page shows beside the buttons (the price, their komaTokens,
 * their pity, the odds), picking the item the guarantee gives, and their pull history (GET
 * /api/gacha/history: lib/game/items/history.ts). Each takes which banner (`banner`: the standard one
 * when left out).
 */

/** What the gacha routes use (the database's, unless a test says otherwise). */
export interface GachaStore {
  view: (guildId: string, userId: string, banner: BannerId) => Promise<BannerView>;
  /** One pull, or a multi pull: what came out, or why not (nothing was spent): 'too_poor', or 'closed' for a limited banner that isn't open. */
  pull: (guildId: string, userId: string, multi: boolean, banner: BannerId) => Promise<BannerResult | 'too_poor' | 'closed'>;
  /** Picks the item a banner's guarantee gives them (null: any of them): the banner after, or 'not_found' when the guarantee can't give that item. */
  pick: (guildId: string, userId: string, banner: BannerId, itemId: string | null) => Promise<BannerView | 'not_found'>;
  /** A page of their pulls on a banner, the newest first (1: the newest; past the last: the last). */
  history: (guildId: string, userId: string, banner: BannerId, page: number) => Promise<PullHistory>;
}

const bannerItem = (item: ItemDef): BannerItem => ({ itemId: item.id, name: item.name, stars: item.stars, slot: item.slot, description: item.description, uniqueWeapon: item.uniqueWeapon ?? null, uniqueTreasure: item.uniqueTreasure ? { hero: item.uniqueTreasure.hero, skill: item.uniqueTreasure.skill } : null, });

/** Weights as each one's chance (0 to 1). */
const shares = (weights: readonly number[]): number[] => {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => (total > 0 ? weight / total : 0));
};

/** The Hero Item banner: its unique weapons and treasures, how its top tier splits between them, and how refined a new copy comes (HERO_BANNER). */
export const heroBanner = (): HeroBanner => ({
  featured: UNIQUE_WEAPONS.map(bannerItem),
  treasures: UNIQUE_TREASURES.map(bannerItem),
  weaponShare: UNIQUE_TREASURES.length === 0 ? 1 : UNIQUE_WEAPONS.length === 0 ? 0 : HERO_BANNER.weaponShare,
  weaponLevels: shares(HERO_BANNER.weaponLevels),
  treasureLevels: shares(HERO_BANNER.treasureLevels),
});

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

/** Each tier's share of a banner's pull weights. */
function rates(banner: BannerId): Record<Stars, number> {
  const weights = bannerWeights(banner);
  const total = STARS.reduce((sum, stars) => sum + weights[stars], 0);
  const out = {} as Record<Stars, number>;
  for (const stars of STARS) out[stars] = total > 0 ? weights[stars] / total : 0;
  return out;
}

const pulled = (userId: string, { item, isNew, count, level }: PulledItem): BannerPull => ({
  itemId: item.id,
  icon: item.kr?.icon ?? item.grant?.icon ?? null,
  name: item.name,
  stars: item.stars,
  slot: item.slot,
  description: item.description,
  isNew,
  count,
  borrowed: canUseItem(item, userId) ? null : itemEffectiveness(item, userId),
  uniqueWeapon: item.uniqueWeapon ?? null,
  uniqueTreasure: item.uniqueTreasure ? { hero: item.uniqueTreasure.hero, skill: item.uniqueTreasure.skill } : null,
  level,
  heroOnly: heroOnly(item),
});

async function bannerView(guildId: string, userId: string, banner: BannerId): Promise<BannerView> {
  const member = await collections().members.findOne({ guildId, userId });
  const { softStart, hardPity } = CONFIG.gacha.pity;
  // As pullMany counts it: only while pity is on and the top tier can be pulled at all.
  const pityOn = hardPity > 0 && topChance(1, bannerWeights(banner)) > 0;
  // Only the standard banner's guarantee gives their own treasure.
  const [own] = banner === 'standard' ? ownTreasures(userId) : [];
  const brief = (item: ItemDef) => ({ itemId: item.id, name: item.name, stars: item.stars, slot: item.slot });
  const mine = new Set(ownTreasures(userId).map((item) => item.id));
  const choice = (item: ItemDef): GuaranteeChoice => ({
    ...brief(item),
    mine: mine.has(item.id),
    uniqueWeapon: item.uniqueWeapon ?? null,
    uniqueTreasure: item.uniqueTreasure ? { hero: item.uniqueTreasure.hero, skill: item.uniqueTreasure.skill } : null,
  });
  const gear = gearEffects(await resolveGear(guildId, userId, member?.equipment), userId);
  return {
    banner,
    limited: limitedBanner(),
    hero: heroBanner(),
    cost: pullCost(CONFIG.gacha.cost, gear),
    baseCost: CONFIG.gacha.cost,
    multi: MULTI_PULLS,
    balance: member?.points ?? 0,
    tokens: member?.tokens ?? 0,
    topStars: PITY_STARS,
    pity: pityOn ? { count: pityCount(member, banner), softStart, hardPity } : null,
    guaranteed: isGuaranteed(member, banner),
    own: own ? brief(own) : null,
    choices: guaranteeChoices(userId, banner).map(choice),
    pick: guaranteePick(member, userId, banner),
    rates: rates(banner),
    extraChance: extraPullChance(gear),
  };
}

/** A page of a member's pulls on a banner, from the ledger. */
async function pullHistory(guildId: string, userId: string, banner: BannerId, page: number): Promise<PullHistory> {
  const { ledger } = collections();
  const filter = historyFilter(guildId, userId, banner);
  const total = await ledger.countDocuments(filter);
  const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE));
  const shown = Math.min(Math.max(1, page), pages);
  // (A multi pull's entries share their time: in the order they were written, the last first.)
  const entries = await ledger
    .find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((shown - 1) * HISTORY_PAGE)
    .limit(HISTORY_PAGE)
    .toArray();
  const pulls = entries.map((entry): PullRecord => {
    const id = entry.itemId ?? '';
    const item = ITEMS_BY_ID.get(id);
    return {
      itemId: id,
      name: item?.name ?? id,
      stars: item?.stars ?? 1,
      slot: item?.slot ?? 'treasure',
      part: item?.kr?.part ?? null,
      grant: item?.grant ? ('selector' in item.grant ? 'ticket' : 'rune') : null,
      icon: item?.kr?.icon ?? item?.grant?.icon ?? null,
      bonus: entry.reason === 'gacha_bonus',
      removed: !item,
      at: entry.createdAt.getTime(),
    };
  });
  return { banner, page: shown, pages, perPage: HISTORY_PAGE, total, pulls };
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
  history: pullHistory,
};
