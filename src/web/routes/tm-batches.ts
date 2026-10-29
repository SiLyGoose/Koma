import { Router } from 'express';
import type { ApiDeps } from '../api.js';
import { tmBatchController } from '../controllers/tm-batches.js';
import { member, signedIn } from '../middleware/auth.js';
import { tmBatchService } from '../services/tm-batches.js';

/* /api/tm-batches: the raid page's background raids, with its link (or the site's login), for a member in a server they're in. */
export function tmBatchRoutes(deps: ApiDeps): Router {
  const batches = tmBatchController(tmBatchService(deps));

  return Router()
    .use(signedIn(deps, 'play'), member(deps))
    .get('/', batches.view)
    .post('/start', batches.start)
    .post('/stop', batches.stop);
}
