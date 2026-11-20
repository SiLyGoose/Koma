import express, { Router } from 'express';
import { signedIn } from './middleware/auth.js';
import { compressJson } from './middleware/compress.js';
import { errors, notFound } from './middleware/errors.js';
import { cors, siteOnly } from './middleware/site.js';
import { adminRoutes } from './routes/admin.js';
import { databankRoutes } from './routes/databank.js';
import { gachaRoutes } from './routes/gacha.js';
import { gearRoutes } from './routes/gear.js';
import { heroRoutes } from './routes/heroes.js';
import { runeRoutes } from './routes/runes.js';
import { mailRoutes } from './routes/mail.js';
import { liveRoutes } from './routes/live.js';
import { loginRoutes } from './routes/login.js';
import { outfitRoutes } from './routes/outfits.js';
import { heroOutfitRoutes } from './routes/hero-outfits.js';
import { tmBatchRoutes } from './routes/tm-batches.js';
import { raidShopRoutes } from './routes/raid-shop.js';
import { publicRoutes } from './routes/public.js';
import { raidRoutes } from './routes/raid.js';
import { raidRoomRoutes } from './routes/raid-rooms.js';
import { divineRoutes } from './routes/divine.js';
/** Big enough for a sale of the most copies POST /api/gear/sell takes. */
const MAX_BODY_BYTES = 32_768;
/** The site's API, under /api. Anything else is a plain 404. */
export function createApi(deps) {
    const { origin } = deps.config;
    const api = Router()
        .use(cors(origin), compressJson)
        .use(publicRoutes(deps))
        // Everything else is for the site only, with bodies in JSON (whatever they say they are).
        .use(siteOnly(origin), express.json({ limit: MAX_BODY_BYTES, type: () => true }))
        .use('/databank', databankRoutes())
        .use(loginRoutes(deps))
        .use(liveRoutes(deps))
        .use('/gear', gearRoutes(deps))
        .use('/gacha', gachaRoutes(deps))
        .use('/outfits', outfitRoutes(deps))
        .use('/hero-outfits', heroOutfitRoutes(deps))
        .use('/tm-batches', tmBatchRoutes(deps))
        .use('/heroes', heroRoutes(deps))
        .use('/runes', runeRoutes(deps))
        .use('/mail', mailRoutes(deps))
        .use('/raid-shop', raidShopRoutes(deps))
        .use('/raid', raidRoutes(deps))
        .use('/raid-rooms', raidRoomRoutes(deps))
        .use('/divine', divineRoutes(deps))
        .use('/admin', adminRoutes(deps))
        // Nothing else is there (once they've logged in).
        .use(signedIn(deps), notFound);
    const app = express();
    app.disable('x-powered-by');
    app.set('etag', false);
    app.use('/api', api);
    app.use(errors);
    app.use((_req, res) => void res.status(404).type('text/plain').send('Not found'));
    return app;
}
//# sourceMappingURL=api.js.map