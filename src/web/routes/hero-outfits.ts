import { Router } from 'express';
import type { ApiDeps } from '../api.js';
import { heroOutfitController } from '../controllers/hero-outfits.js';
import { member, signedIn } from '../middleware/auth.js';
import { heroOutfitService } from '../services/hero-outfits.js';

/* /api/hero-outfits: the shop's Hero Outfits tab and the heroes' outfit room, for a logged-in member in a server they're in. */
export function heroOutfitRoutes(deps: ApiDeps): Router {
  const outfits = heroOutfitController(heroOutfitService(deps));

  return Router()
    .use(signedIn(deps), member(deps))
    .get('/', outfits.view)
    .post('/buy', outfits.buy)
    .post('/wear', outfits.wear);
}
