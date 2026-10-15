import { Router } from 'express';
import type { ApiDeps } from '../api.js';
import { heroController } from '../controllers/heroes.js';
import { member, signedIn } from '../middleware/auth.js';
import { heroService } from '../services/heroes.js';

/* /api/heroes: the shop's Heroes tab and the heroes page (theirs, and others' to look at), for a logged-in member in a server they're in. */
export function heroRoutes(deps: ApiDeps): Router {
  const heroes = heroController(heroService(deps));

  return Router()
    .use(signedIn(deps), member(deps))
    .get('/', heroes.view)
    .get('/members', heroes.members)
    .post('/buy', heroes.buy)
    .post('/equip', heroes.equip)
    .post('/unequip', heroes.unequip)
    .post('/transcend', heroes.transcend);
}
