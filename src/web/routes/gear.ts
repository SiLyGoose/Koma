import { Router } from 'express';
import type { ApiDeps } from '../api.js';
import { gearController } from '../controllers/gear.js';
import { member, signedIn } from '../middleware/auth.js';
import { gearService } from '../services/gear.js';

/*
 * /api/gear: for a logged-in member, in a server they're in. A game's link answers some of them too, for
 * its own member in its own server: looking, and changing what they wear (the raid's party screen).
 * Selling, refining, forging, locking and the roster stay on the site's gear page.
 */
export function gearRoutes(deps: ApiDeps): Router {
  const gear = gearController(gearService(deps));
  const site = [signedIn(deps), member(deps)];
  const siteOrLink = [signedIn(deps, 'play'), member(deps)];

  return Router()
    .get('/', ...siteOrLink, gear.view)
    .get('/members', ...site, gear.members)
    .post('/equip', ...siteOrLink, gear.equip)
    .post('/unequip', ...siteOrLink, gear.unequip)
    .post('/unequip-all', ...siteOrLink, gear.unequipAll)
    .post('/loadout', ...siteOrLink, gear.loadout)
    .post('/refine', ...site, gear.refine)
    .post('/forge', ...site, gear.forge)
    .post('/sell', ...site, gear.sell)
    .post('/lock', ...site, gear.lock);
}
