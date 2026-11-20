import { Router } from 'express';
import { raidShopController } from '../controllers/raid-shop.js';
import { member, signedIn } from '../middleware/auth.js';
import { raidShopService } from '../services/raid-shop.js';
/* /api/raid-shop: the shop's Raid Gear tab, for a logged-in member in a server they're in. */
export function raidShopRoutes(deps) {
    const shop = raidShopController(raidShopService(deps));
    return Router().use(signedIn(deps), member(deps)).get('/', shop.view).post('/buy', shop.buy).post('/refresh', shop.refresh).post('/craft', shop.craft).post('/use', shop.use);
}
//# sourceMappingURL=raid-shop.js.map