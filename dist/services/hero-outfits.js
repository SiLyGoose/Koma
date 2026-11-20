import { CONFIG } from '../config.js';
import { gloryTier, HERO_OUTFITS, HEROES_BY_ID, isLegendOutfit } from '../data/heroes.js';
import { collections } from '../db.js';
import { ensureMember, recordLedger } from './economy/shared.js';
/** A hero's outfits its owner bought (that still exist and are its), in its skins' order. */
export const ownedHeroOutfits = (heroId, hero) => {
    const bought = new Set(hero?.outfits ?? []);
    return (HEROES_BY_ID.get(heroId)?.outfits ?? []).slice(1).filter((outfit) => bought.has(outfit));
};
/** The skin a hero is in (by its index): the outfit it wears, where that's still one of its bought ones, else its own look (0). */
export const wornSkin = (heroId, hero) => {
    const outfit = hero?.outfit;
    if (!outfit || !ownedHeroOutfits(heroId, hero).includes(outfit))
        return 0;
    return HERO_OUTFITS.get(outfit)?.skin ?? 0;
};
/** What outfit `id` costs: hero.outfitPrice, a Glory League costume its tier's (gloryTier), a Legend Costume hero.legendOutfitPrice. */
export function heroOutfitPrice(id) {
    if (isLegendOutfit(id))
        return CONFIG.hero.legendOutfitPrice;
    const tier = gloryTier(id);
    if (tier === 'honor')
        return CONFIG.hero.honorOutfitPrice;
    if (tier === 'brilliant')
        return CONFIG.hero.brilliantOutfitPrice;
    if (tier === 'glaring')
        return CONFIG.hero.glaringOutfitPrice;
    return CONFIG.hero.outfitPrice;
}
/** Buys outfit `id` for the member's hero whose it is (it isn't put on). */
export async function buyHeroOutfit(guildId, userId, id) {
    const of = HERO_OUTFITS.get(id);
    if (!of)
        return { ok: false, reason: 'not_found' };
    const price = heroOutfitPrice(id);
    const { members } = collections();
    await ensureMember(guildId, userId);
    const at = `heroes.${of.hero}`;
    const bought = await members.findOneAndUpdate({ guildId, userId, [at]: { $exists: true }, [`${at}.outfits`]: { $ne: id }, points: { $gte: price } }, { $inc: { points: -price }, $addToSet: { [`${at}.outfits`]: id } }, { returnDocument: 'after' });
    if (!bought) {
        const hero = (await members.findOne({ guildId, userId }))?.heroes?.[of.hero];
        return { ok: false, reason: !hero ? 'not_owned' : hero.outfits?.includes(id) ? 'owned' : 'too_poor' };
    }
    if (price > 0)
        await recordLedger([{ guildId, userId, delta: -price, reason: 'hero_outfit', itemId: id }]);
    return { ok: true, paid: price, balance: bought.points };
}
/** Puts outfit `id` on the member's hero `heroId` (null: its own look again), which must be one of its bought ones. */
export async function wearHeroOutfit(guildId, userId, heroId, id) {
    if (!HEROES_BY_ID.has(heroId) || (id !== null && HERO_OUTFITS.get(id)?.hero !== heroId))
        return { ok: false, reason: 'not_found' };
    const at = `heroes.${heroId}`;
    const worn = await collections().members.updateOne({ guildId, userId, [at]: { $exists: true }, ...(id !== null && { [`${at}.outfits`]: id }) }, { $set: { [`${at}.outfit`]: id } });
    return worn.matchedCount === 0 ? { ok: false, reason: 'not_owned' } : { ok: true };
}
//# sourceMappingURL=hero-outfits.js.map