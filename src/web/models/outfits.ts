import { CONFIG } from '../../config.js';
import { DEFAULT_OUTFIT, OUTFITS } from '../../data/outfits.js';
import { collections } from '../../db.js';
import { buyOutfit, ownedOutfits, wearOutfit, wornOutfit } from '../../services/outfits.js';

/*
 * The shop's Outfits tab (GET /api/outfits, POST /api/outfits/buy and /wear): every outfit
 * (data/outfits.ts), what each costs, which the member has and which they wear, and buying and
 * putting one on (services/outfits.ts).
 */

/** One outfit, as the shop shows it. */
export interface OutfitView {
  /** The site draws it by this id (its src/shared/characters.ts). */
  id: string;
  name: string;
  /** What it costs in points (0 for the default, which everyone has). */
  price: number;
  owned: boolean;
}

/** GET /api/outfits: the outfits, in the shop's order, and the member's points. */
export interface OutfitsView {
  outfits: OutfitView[];
  /** The id of the one they wear. */
  worn: string;
  balance: number;
}

/** What the outfit routes use (the database's, unless a test says otherwise). */
export interface OutfitStore {
  view: (guildId: string, userId: string) => Promise<OutfitsView>;
  /** Buys an outfit and puts it on: the shop after, or why not (nothing was spent). */
  buy: (guildId: string, userId: string, id: string) => Promise<OutfitsView | 'not_found' | 'owned' | 'too_poor'>;
  /** Puts on one of their outfits: the shop after, or why not. */
  wear: (guildId: string, userId: string, id: string) => Promise<OutfitsView | 'not_found' | 'not_owned'>;
}

async function outfitsView(guildId: string, userId: string): Promise<OutfitsView> {
  const member = await collections().members.findOne({ guildId, userId });
  const owned = new Set(ownedOutfits(member));
  return {
    outfits: OUTFITS.map(({ id, name }) => ({ id, name, price: id === DEFAULT_OUTFIT ? 0 : CONFIG.outfit.price, owned: owned.has(id) })),
    worn: wornOutfit(member),
    balance: member?.points ?? 0,
  };
}

export const outfitStore: OutfitStore = {
  view: outfitsView,
  buy: async (guildId, userId, id) => {
    const result = await buyOutfit(guildId, userId, id);
    return result.ok ? outfitsView(guildId, userId) : result.reason;
  },
  wear: async (guildId, userId, id) => {
    const result = await wearOutfit(guildId, userId, id);
    return result.ok ? outfitsView(guildId, userId) : result.reason;
  },
};
