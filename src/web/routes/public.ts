import { Router } from 'express';
import type { ApiDeps } from '../api.js';
import { loginController } from '../controllers/login.js';
import { raidController } from '../controllers/raid.js';
import { loginService } from '../services/login.js';
import { raidService } from '../services/raid.js';

/*
 * What's answered whatever the origin: the browser going to log in (a navigation), and the raid boss's
 * pictures (the raid page's <img>, which sends no Origin).
 */
export function publicRoutes(deps: ApiDeps): Router {
  const login = loginController(loginService(deps));
  const raid = raidController(raidService(deps));

  return Router()
    .get('/login', login.redirect)
    .get('/raid/boss', raid.bossPicture);
}
