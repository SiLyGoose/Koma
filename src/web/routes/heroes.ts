import { Router } from 'express';
import type { ApiDeps } from '../api.js';
import { heroController } from '../controllers/heroes.js';
import { member, signedIn } from '../middleware/auth.js';
import { heroService } from '../services/heroes.js';

/*
 * /api/heroes: the shop's Heroes tab and the heroes page (theirs, and others' to look at), for a logged-in member in a
 * server they're in. A game's link answers all but buying, selling, locking and the salvage rule too (those stay on the site, as the gear page's
 * do), for its own member in its own server: the TechnoMagic Raid's Manage shows the heroes page in a popup, so they gear their
 * heroes without leaving the room.
 */
export function heroRoutes(deps: ApiDeps): Router {
  const heroes = heroController(heroService(deps));
  const site = [signedIn(deps), member(deps)];
  const siteOrLink = [signedIn(deps, 'play'), member(deps)];

  return Router()
    .get('/', ...siteOrLink, heroes.view)
    .get('/members', ...siteOrLink, heroes.members)
    .post('/buy', ...site, heroes.buy)
    .post('/equip', ...siteOrLink, heroes.equip)
    .post('/unequip', ...siteOrLink, heroes.unequip)
    .post('/perks', ...siteOrLink, heroes.perks)
    .post('/transcend', ...siteOrLink, heroes.transcend)
    .post('/scroll', ...siteOrLink, heroes.scroll)
    .post('/refine', ...siteOrLink, heroes.refine)
    .post('/rune', ...siteOrLink, heroes.rune)
    .post('/reroll', ...siteOrLink, heroes.reroll)
    .post('/keep', ...siteOrLink, heroes.keep)
    .post('/upgrade', ...siteOrLink, heroes.upgrade)
    .post('/sell', ...site, heroes.sell)
    .post('/lock', ...site, heroes.lock)
    .post('/auto-salvage', ...site, heroes.autoSalvage)
    .post('/craft', ...site, heroes.craft)
    .post('/craft-scroll', ...site, heroes.craftScrolls)
    .post('/open-box', ...site, heroes.openBox);
}
