import type { RequestHandler, Response } from 'express';
import { z } from 'zod';
import { WATCHABLE, type LiveService } from '../services/live.js';
import type { Player } from '../token.js';
import { parse } from '../validate.js';

/* Who's online, watching, and the leaderboard. Each runs after middleware/auth.ts's liveMember. */

const Watch = z.object({ game: z.enum(WATCHABLE), target: z.string() });
const Stat = z.object({ stat: z.enum(['dug', 'earned']) });

/** Who's asking, in the server they're asking about. */
const viewerOf = (res: Response): Player => ({ guildId: res.locals.guildId, userId: res.locals.session.userId, name: res.locals.name });

export function liveController(live: LiveService) {
  return {
    online(_req, res) {
      const viewer = viewerOf(res);
      if (!res.locals.link) live.seenOnFrontPage(viewer);
      res.json(live.online(viewer));
    },

    async leaderboard(req, res) {
      const { stat } = parse(Stat, req.query);
      res.json(await live.leaderboard(viewerOf(res), stat));
    },

    watch(req, res) {
      const { game, target } = parse(Watch, req.body);
      res.json({ url: live.watchLink(viewerOf(res), game, target) });
    },
  } satisfies Record<string, RequestHandler>;
}
