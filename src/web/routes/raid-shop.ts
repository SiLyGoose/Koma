import { Router } from 'express';
import type { ApiDeps } from '../api.js';
import { raidShopController } from '../controllers/raid-shop.js';
import { member, signedIn } from '../middleware/auth.js';
import { raidShopService } from '../services/raid-shop.js';

/* /api/raid-shop: the shop's Raid Gear tab, for a logged-in member in a server they're in. */
export function raidShopRoutes(deps: ApiDeps): Router {
  const shop = raidShopController(raidShopService(deps));

  return Router().use(signedIn(deps), member(deps)).get('/', shop.view).post('/buy', shop.buy).post('/refresh', shop.refresh);
}
