import { CONFIG } from '../../config.js';
import { DEFAULT_OUTFIT, OUTFITS } from '../../data/outfits.js';
import { collections } from '../../db.js';
import { buyOutfit, ownedOutfits, wearOutfit, wornOutfit } from '../../services/outfits.js';
async function outfitsView(guildId, userId) {
    const member = await collections().members.findOne({ guildId, userId });
    const owned = new Set(ownedOutfits(member));
    return {
        outfits: OUTFITS.map(({ id, name }) => ({ id, name, price: id === DEFAULT_OUTFIT ? 0 : CONFIG.outfit.price, owned: owned.has(id) })),
        worn: wornOutfit(member),
        balance: member?.points ?? 0,
    };
}
export const outfitStore = {
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
//# sourceMappingURL=outfits.js.map