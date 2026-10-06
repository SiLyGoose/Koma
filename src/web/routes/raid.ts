import { Router } from 'express';
import type { ApiDeps } from '../api.js';
import { raidController } from '../controllers/raid.js';
import { signedIn } from '../middleware/auth.js';
import { raidService } from '../services/raid.js';

/* /api/raid: a raider's gear as they fought, for the raid's link. (The boss's pictures are in public.ts.) */
export function raidRoutes(deps: ApiDeps): Router {
  const raid = raidController(raidService(deps));

  return Router().get('/gear', signedIn(deps, 'play'), raid.gear);
}
