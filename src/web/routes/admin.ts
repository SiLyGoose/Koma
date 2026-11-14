import { Router } from 'express';
import type { ApiDeps } from '../api.js';
import { adminController } from '../controllers/admin.js';
import { admin, signedIn } from '../middleware/auth.js';
import { adminService } from '../services/admin.js';

/* /api/admin: the site's admin page, for the bot admin only, logged in (never with a game link). */
export function adminRoutes(deps: ApiDeps): Router {
  const settings = adminController(adminService(deps));

  return Router()
    .use(signedIn(deps), admin)
    .get('/settings', settings.settings)
    .post('/settings', settings.change);
}
