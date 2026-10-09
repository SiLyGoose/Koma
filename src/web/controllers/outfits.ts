import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { OutfitService } from '../services/outfits.js';
import { parse } from '../lib/validate.js';

/* The shop's Outfits tab's requests. Each runs after middleware/auth.ts's member: res.locals has the server and who's asking. */

const Outfit = z.object({ outfit: z.string() });

export function outfitController(outfits: OutfitService) {
  return {
    async view(_req, res) {
      res.json(await outfits.view(res.locals.guildId, res.locals.session.userId));
    },

    async buy(req, res) {
      const { outfit } = parse(Outfit, req.body);
      res.json(await outfits.buy(res.locals.guildId, res.locals.session.userId, outfit));
    },

    async wear(req, res) {
      const { outfit } = parse(Outfit, req.body);
      res.json(await outfits.wear(res.locals.guildId, res.locals.session.userId, outfit));
    },
  } satisfies Record<string, RequestHandler>;
}
