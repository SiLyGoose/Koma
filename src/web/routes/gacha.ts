import { Router } from 'express';
import type { ApiDeps } from '../api.js';
import { gachaController } from '../controllers/gacha.js';
import { member, signedIn } from '../middleware/auth.js';
import { gachaService } from '../services/gacha.js';

/* /api/gacha: the banner page, for a logged-in member in a server they're in. */
export function gachaRoutes(deps: ApiDeps): Router {
  const gacha = gachaController(gachaService(deps));

  return Router()
    .use(signedIn(deps), member(deps))
    .get('/', gacha.view)
    .post('/pull', gacha.pull);
}
