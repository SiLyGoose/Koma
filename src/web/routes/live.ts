import { Router } from 'express';
import type { ApiDeps } from '../api.js';
import { liveController } from '../controllers/live.js';
import { liveMember, member, signedIn } from '../middleware/auth.js';
import { liveService } from '../services/live.js';

/*
 * Who's online, the friends list, watching them, and the Pinecraft leaderboard: for a game page with its link's token (to
 * play, or to watch; about the link's server), or a logged-in member on the front page (about the server
 * in the query).
 */
export function liveRoutes(deps: ApiDeps): Router {
  const live = liveController(liveService(deps));
  const asking = [signedIn(deps, 'watch'), liveMember(deps)];

  return Router()
    .get('/live', ...asking, live.online)
    .get('/friends', ...asking, live.friends)
    // (Logged in on the site only: a game's link doesn't walk the town.)
    .post('/friends/hero', signedIn(deps), member(deps), live.townHero)
    .post('/watch', ...asking, live.watch)
    .get('/pinecraft/leaderboard', ...asking, live.leaderboard);
}
