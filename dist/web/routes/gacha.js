import { Router } from 'express';
import { gachaController } from '../controllers/gacha.js';
import { member, signedIn } from '../middleware/auth.js';
import { gachaService } from '../services/gacha.js';
/* /api/gacha: the banner page, for a logged-in member in a server they're in. */
export function gachaRoutes(deps) {
    const gacha = gachaController(gachaService(deps));
    return Router()
        .use(signedIn(deps), member(deps))
        .get('/', gacha.view)
        .get('/history', gacha.history)
        .post('/pull', gacha.pull)
        .post('/pick', gacha.pick);
}
//# sourceMappingURL=gacha.js.map