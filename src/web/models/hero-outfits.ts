import { CONFIG } from '../../config.js';
import { HEROES, HEROES_BY_ID } from '../../data/heroes.js';
import { collections } from '../../db.js';
import { buyHeroOutfit, ownedHeroOutfits, wearHeroOutfit, wornSkin } from '../../services/hero-outfits.js';
import type { HeroOutfitsView, HeroOutfitView } from '../../protocol/hero-outfits.js';

export type { HeroOutfitsView, HeroOutfitView };

/*
 * The site's hero outfits (GET /api/hero-outfits, POST /api/hero-outfits/buy and /wear): every hero's outfits (data/heroes.ts),
 * what each costs, which the member has and which each of their heroes wears; buying one (the shop's Hero Outfits tab) and
 * putting one on (a hero's outfit room) (services/hero-outfits.ts).
 */

/** What the hero outfit routes use (the database's, unless a test says otherwise). */
export interface HeroOutfitStore {
  view: (guildId: string, userId: string) => Promise<HeroOutfitsView>;
  /** Buys an outfit (it isn't put on): the outfits after, or why not (nothing was spent). */
  buy: (guildId: string, userId: string, id: string) => Promise<HeroOutfitsView | 'not_found' | 'not_owned' | 'owned' | 'too_poor'>;
  /** Puts one of their hero's outfits on it (null: its own look): the outfits after, or why not. */
  wear: (guildId: string, userId: string, hero: string, id: string | null) => Promise<HeroOutfitsView | 'not_found' | 'not_owned'>;
}

async function heroOutfitsView(guildId: string, userId: string): Promise<HeroOutfitsView> {
  const member = await collections().members.findOne({ guildId, userId }, { projection: { heroes: 1, points: 1 } });
  const mine = Object.entries(member?.heroes ?? {}).filter(([id]) => HEROES_BY_ID.has(id));
  const owned = new Set(mine.flatMap(([id, hero]) => ownedHeroOutfits(id, hero)));
  const worn: Record<string, string> = {};
  for (const [id, hero] of mine) {
    const skin = wornSkin(id, hero);
    if (skin > 0) worn[id] = HEROES_BY_ID.get(id)!.outfits[skin];
  }
  return {
    outfits: HEROES.flatMap((hero) => hero.outfits.slice(1).map((id) => ({ id, hero: hero.id, price: CONFIG.hero.outfitPrice, owned: owned.has(id) }))),
    heroes: mine.map(([id]) => id),
    worn,
    balance: member?.points ?? 0,
  };
}

export const heroOutfitStore: HeroOutfitStore = {
  view: heroOutfitsView,
  buy: async (guildId, userId, id) => {
    const result = await buyHeroOutfit(guildId, userId, id);
    return result.ok ? heroOutfitsView(guildId, userId) : result.reason;
  },
  wear: async (guildId, userId, hero, id) => {
    const result = await wearHeroOutfit(guildId, userId, hero, id);
    return result.ok ? heroOutfitsView(guildId, userId) : result.reason;
  },
};
