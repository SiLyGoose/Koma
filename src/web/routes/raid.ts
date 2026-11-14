import { Router } from 'express';
import type { ApiDeps } from '../api.js';
import { raidController } from '../controllers/raid.js';
import { member, signedIn } from '../middleware/auth.js';
import { raidService } from '../services/raid.js';

/*
 * /api/raid: a raider's gear as they fought, for the raid's link; and how a server's raid stands (this week's
 * boss, how far its difficulty is unlocked), for a logged-in member in it. (The boss's pictures are in public.ts.)
 */
export function raidRoutes(deps: ApiDeps): Router {
  const raid = raidController(raidService(deps));

  return Router().get('/gear', signedIn(deps, 'play'), raid.gear).get('/week', signedIn(deps), member(deps), raid.week);
}
