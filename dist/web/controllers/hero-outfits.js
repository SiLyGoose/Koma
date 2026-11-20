import { z } from 'zod';
import { parse } from '../lib/validate.js';
/* The hero outfits' requests (the shop's and a hero's outfit room's). Each runs after middleware/auth.ts's member: res.locals has the server and who's asking. */
const Outfit = z.object({ outfit: z.string() });
const Wear = z.object({ hero: z.string(), outfit: z.string().nullable() });
export function heroOutfitController(outfits) {
    return {
        async view(_req, res) {
            res.json(await outfits.view(res.locals.guildId, res.locals.session.userId));
        },
        async buy(req, res) {
            const { outfit } = parse(Outfit, req.body);
            res.json(await outfits.buy(res.locals.guildId, res.locals.session.userId, outfit));
        },
        async wear(req, res) {
            const { hero, outfit } = parse(Wear, req.body);
            res.json(await outfits.wear(res.locals.guildId, res.locals.session.userId, hero, outfit));
        },
    };
}
//# sourceMappingURL=hero-outfits.js.map