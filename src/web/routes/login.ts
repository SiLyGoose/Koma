import { Router } from 'express';
import type { ApiDeps } from '../api.js';
import { loginController } from '../controllers/login.js';
import { signedIn } from '../middleware/auth.js';
import { loginService } from '../services/login.js';

/* Logging in on the site, who is logged in, and links to play. (GET /api/login is in public.ts.) */
export function loginRoutes(deps: ApiDeps): Router {
  const login = loginController(loginService(deps));

  return Router()
    .post('/login', login.logIn)
    .get('/me', signedIn(deps), login.me)
    .post('/play', signedIn(deps), login.play);
}
