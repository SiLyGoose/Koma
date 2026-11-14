import { Router } from 'express';
import type { ApiDeps } from '../api.js';
import { runeController } from '../controllers/runes.js';
import { member, signedIn } from '../middleware/auth.js';
import { runeService } from '../services/runes.js';

/*
 * /api/runes: selling and disassembling a logged-in member's runes and crafting Mysterious Runes (the site's Inventory, as
 * the gear's sale stays on the site), and disassembling one in a socket (the heroes page, so a game's link answers it too).
 */
export function runeRoutes(deps: ApiDeps): Router {
  const runes = runeController(runeService(deps));
  const site = [signedIn(deps), member(deps)];
  const siteOrLink = [signedIn(deps, 'play'), member(deps)];

  return Router().post('/sell', ...site, runes.sell).post('/craft', ...site, runes.craft).post('/break', ...siteOrLink, runes.break);
}
