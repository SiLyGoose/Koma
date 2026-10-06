import { CONFIG, STARS } from '../../config.js';
import { MULTI_PULLS, PITY_STARS } from '../../constants/index.js';
import { collections } from '../../db.js';
import { canUseItem, gearEffects, itemEffectiveness } from '../../lib/game/items/equipment.js';
import { ownTreasures, topChance } from '../../lib/game/items/gacha.js';
import { pullCost } from '../../perks/index.js';
import { pullGacha, pullMulti, type PulledItem } from '../../services/economy/index.js';
import { resolveGear } from '../../services/items/gear.js';
import type { Slot, Stars } from '../../types.js';

/*
 * The site's banner page (GET /api/gacha, POST /api/gacha/pull): pulling from the gacha, as `gacha`
 * and `gacha multi` do in Discord (the same payment, pity and guarantee: services/economy/gacha.ts),
 * and what the page shows beside the buttons (the price, their komaTokens, their pity, the odds).
 */

/** GET /api/gacha: what a pull costs the member, and where their pity stands. */
export interface BannerView {
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
  /** Their next top-tier item is one of their own treasures (their last was someone else's). */
  guaranteed: boolean;
  /** The unique treasure made for them, which the guarantee gives (their first, if they have more): null when none is theirs, so there's no guarantee. */
  own: { itemId: string; name: string; stars: Stars; slot: Slot } | null;
  /** Each tier's chance (0 to 1) on a pull before pity raises the top one. */
  rates: Record<Stars, number>;
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
}

/** POST /api/gacha/pull: what came out, what it was paid with, and the banner as it stands after. */
export interface BannerResult {
  pulls: BannerPull[];
  /** Points spent, after gear. */
  cost: number;
  /** komaTokens spent. */
  tokensUsed: number;
  view: BannerView;
}

/** What the gacha routes use (the database's, unless a test says otherwise). */
export interface GachaStore {
  view: (guildId: string, userId: string) => Promise<BannerView>;
  /** One pull, or a multi pull: what came out, or 'too_poor' (nothing was spent). */
  pull: (guildId: string, userId: string, multi: boolean) => Promise<BannerResult | 'too_poor'>;
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
});

async function bannerView(guildId: string, userId: string): Promise<BannerView> {
  const member = await collections().members.findOne({ guildId, userId });
  const { softStart, hardPity } = CONFIG.gacha.pity;
  // As pullMany counts it: only while pity is on and the top tier can be pulled at all.
  const pityOn = hardPity > 0 && topChance(1) > 0;
  const [own] = ownTreasures(userId);
  return {
    cost: pullCost(CONFIG.gacha.cost, gearEffects(await resolveGear(guildId, userId, member?.equipment), userId)),
    baseCost: CONFIG.gacha.cost,
    multi: MULTI_PULLS,
    balance: member?.points ?? 0,
    tokens: member?.tokens ?? 0,
    topStars: PITY_STARS,
    pity: pityOn ? { count: member?.pity ?? 0, softStart, hardPity } : null,
    guaranteed: member?.guaranteed ?? false,
    own: own ? { itemId: own.id, name: own.name, stars: own.stars, slot: own.slot } : null,
    rates: rates(),
  };
}

export const gachaStore: GachaStore = {
  view: bannerView,
  pull: async (guildId, userId, multi) => {
    if (multi) {
      const result = await pullMulti(guildId, userId);
      if (!result.ok) return 'too_poor';
      return { pulls: result.pulls.map((pull) => pulled(userId, pull)), cost: result.cost, tokensUsed: result.tokensUsed, view: await bannerView(guildId, userId) };
    }
    const result = await pullGacha(guildId, userId);
    if (!result.ok) return 'too_poor';
    return { pulls: [pulled(userId, result)], cost: result.cost, tokensUsed: result.tokensUsed, view: await bannerView(guildId, userId) };
  },
};
