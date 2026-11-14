import { HEROES, HEROES_BY_ID } from '../../data/heroes.js';
import { collections } from '../../db.js';
import { buyHeroOutfit, heroOutfitPrice, ownedHeroOutfits, wearHeroOutfit, wornSkin } from '../../services/hero-outfits.js';
async function heroOutfitsView(guildId, userId) {
    const member = await collections().members.findOne({ guildId, userId }, { projection: { heroes: 1, points: 1 } });
    const mine = Object.entries(member?.heroes ?? {}).filter(([id]) => HEROES_BY_ID.has(id));
    const owned = new Set(mine.flatMap(([id, hero]) => ownedHeroOutfits(id, hero)));
    const worn = {};
    for (const [id, hero] of mine) {
        const skin = wornSkin(id, hero);
        if (skin > 0)
            worn[id] = HEROES_BY_ID.get(id).outfits[skin];
    }
    return {
        outfits: HEROES.flatMap((hero) => hero.outfits.slice(1).map((id) => ({ id, hero: hero.id, price: heroOutfitPrice(id), owned: owned.has(id) }))),
        heroes: mine.map(([id]) => id),
        worn,
        balance: member?.points ?? 0,
    };
}
export const heroOutfitStore = {
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
//# sourceMappingURL=hero-outfits.js.map