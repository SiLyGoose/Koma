import { Router } from 'express';
import type { ApiDeps } from '../api.js';
import { divineController } from '../controllers/divine.js';
import { member, signedIn } from '../middleware/auth.js';
import { divineService } from '../services/divine.js';

/*
 * /api/divine: the Divine Punishment Raid's openings, shop, crafting and Runes of Blasphemy (protocol/divine.ts), for a logged-in
 * member in a server they're in; a game's link answers them too (the raid's page unlocks and gears from its room), but the shop's
 * purchases and crafting, which stay on the site.
 */
export function divineRoutes(deps: ApiDeps): Router {
  const divine = divineController(divineService(deps));
  const site = [signedIn(deps), member(deps)];
  const siteOrLink = [signedIn(deps, 'play'), member(deps)];

  return Router()
    .get('/', ...siteOrLink, divine.view)
    .get('/rewards', ...siteOrLink, divine.rewards)
    .post('/open', ...siteOrLink, divine.open)
    .post('/reset', ...siteOrLink, divine.reset)
    .post('/void', ...site, divine.buyVoid)
    .post('/artifact', ...site, divine.artifact)
    .post('/ticket', ...site, divine.ticket)
    .post('/blasphemy/craft', ...site, divine.craft)
    .post('/blasphemy/break', ...siteOrLink, divine.breakRune)
    .post('/blasphemy/extend', ...site, divine.extend)
    .post('/blasphemy/socket', ...siteOrLink, divine.socket)
    .post('/blasphemy/unsocket', ...siteOrLink, divine.unsocket);
}
