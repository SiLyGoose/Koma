import { CONFIG } from '../config.js';
import { gloryTier, HERO_OUTFITS, HEROES_BY_ID, isLegendOutfit } from '../data/heroes.js';
import { collections } from '../db.js';
import type { HeroDoc } from '../types.js';
import { ensureMember, recordLedger } from './economy/shared.js';

/*
 * Hero outfits (data/heroes.ts HERO_OUTFITS): King's Raid's costumes of the TechnoMagic Raid's heroes, each one of its
 * hero's skins. A hero always has its own look; the others are bought in the site's shop, once each, for
 * hero.outfitPrice points (a Glory League or Legend Costume its own: heroOutfitPrice) (burned), only for a hero the member owns (as King's Raid sells a costume to a hero's owner),
 * and put on in its outfit room whenever they like (buying one doesn't). Buying is one conditional update that only
 * matches while they own the hero, have the points and don't own the outfit yet, so two buys at once can't both pay.
 * The raid fights each hero in the one it wears (./technomagic.ts beginRun).
 */

type OutfitsOf = Pick<HeroDoc, 'outfits' | 'outfit'> | null | undefined;

/** A hero's outfits its owner bought (that still exist and are its), in its skins' order. */
export const ownedHeroOutfits = (heroId: string, hero: OutfitsOf): string[] => {
  const bought = new Set(hero?.outfits ?? []);
  return (HEROES_BY_ID.get(heroId)?.outfits ?? []).slice(1).filter((outfit) => bought.has(outfit));
};

/** The skin a hero is in (by its index): the outfit it wears, where that's still one of its bought ones, else its own look (0). */
export const wornSkin = (heroId: string, hero: OutfitsOf): number => {
  const outfit = hero?.outfit;
  if (!outfit || !ownedHeroOutfits(heroId, hero).includes(outfit)) return 0;
  return HERO_OUTFITS.get(outfit)?.skin ?? 0;
};

/** What outfit `id` costs: hero.outfitPrice, a Glory League costume its tier's (gloryTier), a Legend Costume hero.legendOutfitPrice. */
export function heroOutfitPrice(id: string): number {
  if (isLegendOutfit(id)) return CONFIG.hero.legendOutfitPrice;
  const tier = gloryTier(id);
  if (tier === 'honor') return CONFIG.hero.honorOutfitPrice;
  if (tier === 'brilliant') return CONFIG.hero.brilliantOutfitPrice;
  if (tier === 'glaring') return CONFIG.hero.glaringOutfitPrice;
  return CONFIG.hero.outfitPrice;
}

export type BuyHeroOutfitResult = { ok: true; paid: number; balance: number } | { ok: false; reason: 'not_found' | 'not_owned' | 'owned' | 'too_poor' };

/** Buys outfit `id` for the member's hero whose it is (it isn't put on). */
export async function buyHeroOutfit(guildId: string, userId: string, id: string): Promise<BuyHeroOutfitResult> {
  const of = HERO_OUTFITS.get(id);
  if (!of) return { ok: false, reason: 'not_found' };
  const price = heroOutfitPrice(id);
  const { members } = collections();
  await ensureMember(guildId, userId);
  const at = `heroes.${of.hero}`;
  const bought = await members.findOneAndUpdate(
    { guildId, userId, [at]: { $exists: true }, [`${at}.outfits`]: { $ne: id }, points: { $gte: price } },
    { $inc: { points: -price }, $addToSet: { [`${at}.outfits`]: id } },
    { returnDocument: 'after' },
  );
  if (!bought) {
    const hero = (await members.findOne({ guildId, userId }))?.heroes?.[of.hero];
    return { ok: false, reason: !hero ? 'not_owned' : hero.outfits?.includes(id) ? 'owned' : 'too_poor' };
  }
  if (price > 0) await recordLedger([{ guildId, userId, delta: -price, reason: 'hero_outfit', itemId: id }]);
  return { ok: true, paid: price, balance: bought.points };
}

export type WearHeroOutfitResult = { ok: true } | { ok: false; reason: 'not_found' | 'not_owned' };

/** Puts outfit `id` on the member's hero `heroId` (null: its own look again), which must be one of its bought ones. */
export async function wearHeroOutfit(guildId: string, userId: string, heroId: string, id: string | null): Promise<WearHeroOutfitResult> {
  if (!HEROES_BY_ID.has(heroId) || (id !== null && HERO_OUTFITS.get(id)?.hero !== heroId)) return { ok: false, reason: 'not_found' };
  const at = `heroes.${heroId}`;
  const worn = await collections().members.updateOne(
    { guildId, userId, [at]: { $exists: true }, ...(id !== null && { [`${at}.outfits`]: id }) },
    { $set: { [`${at}.outfit`]: id } },
  );
  return worn.matchedCount === 0 ? { ok: false, reason: 'not_owned' } : { ok: true };
}
