import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { GachaService } from '../services/gacha.js';
import { parse } from '../lib/validate.js';

/* The banner page's requests. Each runs after middleware/auth.ts's member: res.locals has the server and who's asking. */

const Pull = z.object({ multi: z.boolean().nullish() });

export function gachaController(gacha: GachaService) {
  return {
    async view(_req, res) {
      res.json(await gacha.view(res.locals.guildId, res.locals.session.userId));
    },

    async pull(req, res) {
      const { multi } = parse(Pull, req.body);
      res.json(await gacha.pull(res.locals.guildId, res.locals.session.userId, multi ?? false));
    },
  } satisfies Record<string, RequestHandler>;
}
