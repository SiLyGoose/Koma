import { Router } from 'express';
import type { ApiDeps } from '../api.js';
import { outfitController } from '../controllers/outfits.js';
import { member, signedIn } from '../middleware/auth.js';
import { outfitService } from '../services/outfits.js';

/* /api/outfits: the shop's Outfits tab, for a logged-in member in a server they're in. */
export function outfitRoutes(deps: ApiDeps): Router {
  const outfits = outfitController(outfitService(deps));

  return Router()
    .use(signedIn(deps), member(deps))
    .get('/', outfits.view)
    .post('/buy', outfits.buy)
    .post('/wear', outfits.wear);
}
